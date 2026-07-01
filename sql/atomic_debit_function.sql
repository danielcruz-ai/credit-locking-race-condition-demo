-- atomic_debit_function.sql
--
-- Débito atômico de créditos com proteção contra race condition.
--
-- Reimplementação genérica, extraída para fins de portfólio a partir de
-- uma função em produção que protege um sistema de créditos pré-pagos
-- (cobrança na geração de um recurso, não na confirmação).
--
-- O problema: sem lock, duas requisições concorrentes podem ler o mesmo
-- saldo ANTES de qualquer uma delas escrever o novo valor. Resultado:
-- as duas debitam, o saldo final está errado (cliente gastou mais
-- créditos do que tinha).
--
-- A solução: `SELECT ... FOR UPDATE` trava a linha do saldo até o fim
-- da transação. A segunda requisição concorrente espera a primeira
-- terminar (commit ou rollback) antes de conseguir ler o saldo —
-- portanto sempre lê o valor já atualizado.

CREATE OR REPLACE FUNCTION debit_credit_atomic(
  p_account_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (
  success BOOLEAN,
  new_balance NUMERIC,
  message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance NUMERIC;
BEGIN
  -- Trava a linha do saldo até o fim desta transação.
  -- Qualquer outra chamada concorrente para o MESMO account_id
  -- bloqueia aqui até este bloco terminar.
  SELECT balance INTO v_current_balance
  FROM credit_accounts
  WHERE account_id = p_account_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'conta não encontrada';
    RETURN;
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT false, v_current_balance, 'saldo insuficiente';
    RETURN;
  END IF;

  UPDATE credit_accounts
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE account_id = p_account_id;

  RETURN QUERY
    SELECT true, (v_current_balance - p_amount), 'débito confirmado';
END;
$$;

-- Uso:
-- SELECT * FROM debit_credit_atomic('uuid-da-conta', 1);
