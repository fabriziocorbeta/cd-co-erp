// Vercel Serverless Function — inyectar variables de entorno en el frontend
export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/javascript');

  // Retornar configuración como JavaScript que crea window.__ENV__
  const config = `window.__ENV__ = {
  SUPABASE_URL: "${process.env.SUPABASE_URL || 'https://beumpltrjgnehqbhtrxo.supabase.co'}",
  SUPABASE_ANON_KEY: "${process.env.SUPABASE_ANON_KEY || 'sb_publishable__dabJ1ghmLg-pyLbJAPbYg_1_yyk7As'}",
  ANTHROPIC_KEY: "${process.env.ANTHROPIC_KEY || ''}",
  STRIPE_PRO: "${process.env.STRIPE_PRO || ''}",
  STRIPE_BUSINESS: "${process.env.STRIPE_BUSINESS || ''}"
};`;

  res.status(200).send(config);
}
