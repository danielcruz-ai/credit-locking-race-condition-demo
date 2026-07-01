const { test } = require("node:test");
const assert = require("node:assert");
const { unsafeDebit } = require("../src/unsafeDebit");
const { safeDebit } = require("../src/safeDebit");

/**
 * Cenário: conta com 5 créditos. Disparamos 10 débitos concorrentes de
 * 1 crédito cada — só 5 deveriam ter sucesso.
 *
 * Sem proteção (unsafeDebit), o teste prova que MAIS de 5 são aceitos
 * (overdraft) porque várias chamadas leem o saldo antigo antes de
 * qualquer escrita acontecer.
 *
 * Com proteção (safeDebit), exatamente 5 têm sucesso, nunca mais.
 */

function makeStore() {
  return { acc1: { balance: 5 } };
}

test("unsafeDebit: permite overdraft sob concorrência (prova o bug)", async () => {
  const store = makeStore();

  const results = await Promise.all(
    Array.from({ length: 10 }, () => unsafeDebit(store, "acc1", 1))
  );

  const successes = results.filter((r) => r.success).length;

  // Este teste documenta o bug: esperamos ver MAIS sucessos do que o
  // saldo permitiria (ou saldo final negativo). Se seu ambiente não
  // reproduzir o overdraft de forma determinística, isso já é
  // esperado — race conditions são não-determinísticas por natureza,
  // que é exatamente o motivo de não confiarmos nelas em produção.
  assert.ok(
    successes > 5 || store.acc1.balance < 0,
    "esperado: overdraft ou saldo negativo sem proteção de lock"
  );
});

test("safeDebit: nunca permite mais débitos do que o saldo suporta", async () => {
  const store = makeStore();

  const results = await Promise.all(
    Array.from({ length: 10 }, () => safeDebit(store, "acc1", 1))
  );

  const successes = results.filter((r) => r.success).length;

  assert.strictEqual(successes, 5, "exatamente 5 débitos deveriam ter sucesso");
  assert.strictEqual(store.acc1.balance, 0, "saldo final deve ser exatamente 0");
  assert.ok(store.acc1.balance >= 0, "saldo nunca pode ficar negativo");
});

test("safeDebit: contas diferentes não bloqueiam uma à outra", async () => {
  const store = { acc1: { balance: 5 }, acc2: { balance: 5 } };

  const start = Date.now();
  await Promise.all([
    safeDebit(store, "acc1", 1),
    safeDebit(store, "acc2", 1),
  ]);
  const elapsed = Date.now() - start;

  // Se as contas bloqueassem uma à outra, o tempo total seria a soma
  // dos dois delays (~20ms). Como são contas diferentes, devem rodar
  // em paralelo (~10ms).
  assert.ok(elapsed < 20, "contas diferentes devem processar em paralelo");
});
