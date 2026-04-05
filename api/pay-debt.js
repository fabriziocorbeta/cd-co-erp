// Vercel Serverless Function — Pagar Deuda/Tarjeta
// Resta del balance de una cuenta y registra transacción

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Validar JWT ──────────────────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado — token requerido' });
  }
  const jwt = auth.split(' ')[1];

  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[PayDebt] Variables de entorno faltantes');
    return res.status(500).json({ error: 'Variables de entorno no configuradas' });
  }

  // ── 2. Validar JWT con Supabase ────────────────────────────────────
  let user;
  try {
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${jwt}` }
    });
    if (!userRes.ok) {
      console.error('[PayDebt] JWT inválido, status:', userRes.status);
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
    user = await userRes.json();
  } catch (e) {
    console.error('[PayDebt] Exception validando JWT:', e.message);
    return res.status(500).json({ error: 'Error al verificar sesión' });
  }

  // ── 3. Parsear body ────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Body inválido — JSON requerido' });
  }

  const { accountId, amount, currency, description, date } = body || {};

  if (!accountId) return res.status(400).json({ error: 'accountId es requerido' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount debe ser > 0' });
  if (!currency || !['USD', 'PYG', '$', '₲'].includes(currency)) {
    return res.status(400).json({ error: 'currency inválida (USD/PYG/$/ ₲)' });
  }

  const cur = currency === '$' ? 'USD' : currency === '₲' ? 'PYG' : currency;

  console.log(`[PayDebt] Usuario: ${user.email}, accountId: ${accountId}, amount: ${amount} ${cur}`);

  // ── 4. Obtener saldo actual de la cuenta ────────────────────────────
  let account;
  try {
    const accRes = await fetch(
      `${SB_URL}/rest/v1/accounts?id=eq.${accountId}&user_id=eq.${user.id}&select=*`,
      { headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` } }
    );
    const accs = await accRes.json();
    account = Array.isArray(accs) ? accs[0] : null;

    if (!account) {
      console.error(`[PayDebt] Cuenta ${accountId} no encontrada para user ${user.id}`);
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    // Verificar moneda
    if (account.cur !== cur) {
      console.error(`[PayDebt] Moneda mismatch: account.cur=${account.cur}, requested=${cur}`);
      return res.status(400).json({ error: `Cuenta en ${account.cur}, se intenta pagar con ${cur}` });
    }

    const currentBalance = parseFloat(account.balance) || 0;
    console.log(`[PayDebt] Saldo actual: ${currentBalance} ${cur}`);

    // Verificar fondos suficientes
    if (currentBalance < amount) {
      console.warn(`[PayDebt] Fondos insuficientes: ${currentBalance} < ${amount}`);
      return res.status(400).json({
        error: 'Fondos insuficientes',
        detail: `Saldo: ${currentBalance} ${cur}, Intento: ${amount} ${cur}`
      });
    }
  } catch (e) {
    console.error('[PayDebt] Error obteniendo cuenta:', e.message);
    return res.status(500).json({ error: 'Error al obtener cuenta', detail: e.message });
  }

  // ── 5. Actualizar saldo de la cuenta ────────────────────────────────
  const newBalance = parseFloat(account.balance) - amount;

  try {
    const updateRes = await fetch(
      `${SB_URL}/rest/v1/accounts?id=eq.${accountId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SB_SERVICE_KEY,
          'Authorization': `Bearer ${SB_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ balance: newBalance })
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      console.error(`[PayDebt] Error Supabase al actualizar balance: ${JSON.stringify(err)}`);
      return res.status(updateRes.status).json({
        error: 'Error actualizando saldo',
        detail: err,
        hint: 'Verifica RLS policies en tabla accounts'
      });
    }

    const updated = await updateRes.json();
    const updatedAcc = Array.isArray(updated) ? updated[0] : updated;
    console.log(`[PayDebt] ✓ Saldo actualizado: ${account.balance} → ${newBalance} ${cur}`);
  } catch (e) {
    console.error('[PayDebt] Exception actualizando balance:', e.message);
    return res.status(500).json({ error: 'Error interno al actualizar saldo', detail: e.message });
  }

  // ── 6. Registrar transacción en tabla transactions ────────────────
  const txId = 'tx-' + Math.random().toString(36).substr(2, 9);
  const txData = {
    id: txId,
    user_id: user.id,
    type: 'expense',
    description: description || `Pago de deuda`,
    amount: -amount,  // Negativo = gasto
    currency: cur,
    category: 'Pago de Tarjeta',
    date: date || new Date().toISOString().split('T')[0],
    account_id: accountId,
    created_at: new Date().toISOString()
  };

  try {
    const txRes = await fetch(
      `${SB_URL}/rest/v1/transactions`,
      {
        method: 'POST',
        headers: {
          'apikey': SB_SERVICE_KEY,
          'Authorization': `Bearer ${SB_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(txData)
      }
    );

    if (!txRes.ok) {
      const err = await txRes.json().catch(() => ({}));
      console.error(`[PayDebt] Error al registrar transacción: ${JSON.stringify(err)}`);
      // No es fatal — el saldo ya se actualizó, solo el log de transacción falló
      console.warn('[PayDebt] ⚠ Transacción no registrada, pero saldo sí fue actualizado');
    } else {
      console.log(`[PayDebt] ✓ Transacción registrada: ${txId}`);
    }
  } catch (e) {
    console.error('[PayDebt] Exception registrando transacción:', e.message);
    // No es fatal
  }

  // ── 7. Responder con éxito ──────────────────────────────────────────
  return res.status(200).json({
    ok: true,
    account: {
      id: account.id,
      name: account.name,
      balanceBefore: parseFloat(account.balance),
      balanceAfter: newBalance,
      currency: cur,
      amountPaid: amount
    },
    transaction: txId,
    message: `Pago de ₲${amount} registrado exitosamente desde "${account.name}"`
  });
}
