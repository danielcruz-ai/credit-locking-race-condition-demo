/**
 * unsafeDebit.js
 *
 * Versão SEM proteção contra concorrência — existe só para provar o
 * bug que a versão segura (safeDebit.js) resolve. Nunca use isso em
 * produção.
 *
 * O problema: entre o "ler saldo" e o "escrever novo saldo" existe uma
 * janela de tempo (aqui simulada com um delay artificial, representando
 * I/O real de banco de dados). Se duas chamadas concorrentes caem
 * dentro dessa janela, as duas leem o mesmo saldo original e as duas
 * decidem que têm crédito suficiente — mesmo que, juntas, não tenham.
 */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function unsafeDebit(store, accountId, amount) {
  const account = store[accountId];

  // 1. lê o saldo atual
  const currentBalance = account.balance;

  // 2. simula latência de I/O real (rede, disco, etc.)
  await delay(10);

  // 3. decide se há saldo suficiente — com base no valor lido em (1),
  //    que pode já estar desatualizado se outra chamada write-ou entre
  //    o passo 1 e agora
  if (currentBalance < amount) {
    return { success: false, message: "saldo insuficiente" };
  }

  // 4. escreve o novo saldo — sobrescreve qualquer debito concorrente
  account.balance = currentBalance - amount;

  return { success: true, newBalance: account.balance };
}

module.exports = { unsafeDebit };
