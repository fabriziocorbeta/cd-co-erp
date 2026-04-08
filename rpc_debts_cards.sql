CREATE OR REPLACE FUNCTION get_user_cards_v1(p_user_id UUID)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  brand TEXT,
  cur TEXT,
  initial_balance NUMERIC,
  closing_date INT,
  due_date INT,
  notes TEXT,
  used_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.name, c.brand, c.cur, c.initial_balance, c.closing_date, c.due_date, c.notes,
    -- Calculate used amount by summing txs linked to this card
    (SELECT COALESCE(SUM(amount), 0) FROM txs WHERE account_id = c.id AND user_id = p_user_id AND type = 'expense')
    - (SELECT COALESCE(SUM(amount), 0) FROM txs WHERE transferPairId = c.id AND user_id = p_user_id)
    AS used_amount
  FROM cards c
  WHERE c.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
