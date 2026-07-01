/**
 * safeDebit.js
 *
 * Versão protegida contra race condition. Em produção (Postgres) essa
 * proteção vem de `SELECT ... FOR UPDATE`, que trava a linha no banco.
 * Aqui, sem um banco real disponível, o mesmo princípio é demonstrado
 * com um lock em memória por conta: enquanto uma operação está "dentro"
 * da seção crítica para um accountId, qualquer outra chamada para o
 * MESMO accountId espera na fila até a primeira terminar.
 *
 * A ideia central é idêntica à do banco: serializar o acesso à mesma
 * linha/recurso, sem serializar acessos a contas diferentes (contas
 * diferentes continuam podendo debitar em paralelo, sem se bloquear).
 */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Uma fila de promises por accountId — funciona como o "lock" da linha.
const locks = new Map();

async function withAccountLock(accountId, fn) {
  const previous = locks.get(accountId) || Promise.resolve();

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  locks.set(
    accountId,
    previous.then(() => current)
  );

  await previous; // espera qualquer operação anterior nesta conta terminar

  try {
    return await fn();
  } finally {
    release();
  }
}

async function safeDebit(store, accountId, amount) {
  return withAccountLock(accountId, async () => {
    const account = store[accountId];

    const currentBalance = account.balance;

    // mesma latência artificial do unsafeDebit — a diferença não está
    // na velocidade, está em quem consegue entrar nesta seção por vez
    await delay(10);

    if (currentBalance < amount) {
      return { success: false, message: "saldo insuficiente" };
    }

    account.balance = currentBalance - amount;

    return { success: true, newBalance: account.balance };
  });
}

module.exports = { safeDebit };
