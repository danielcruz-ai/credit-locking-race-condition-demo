# credit-locking-race-condition-demo

Débito atômico de créditos com proteção contra race condition — reimplementação genérica e standalone, extraída para fins de portfólio a partir de um sistema de cobrança pré-paga em produção.

## O problema

Sistema de créditos pré-pagos: cliente compra um pacote de créditos, cada ação (gerar um documento, processar um pedido, etc.) debita 1 crédito. Parece trivial — até rodar em produção com requisições concorrentes.

Sem proteção, duas requisições simultâneas para a mesma conta podem:

1. Ler o mesmo saldo (ex: 1 crédito restante)
2. As duas decidirem "há saldo suficiente"
3. As duas debitarem
4. Saldo final: **-1** — o cliente gastou mais do que tinha

Isso é uma **race condition clássica de leitura-antes-de-escrita** (read-then-write), e ela não aparece em teste manual sequencial — só sob carga real, o que a torna especialmente perigosa: passa despercebida até custar dinheiro de verdade.

## A solução

Em produção (Postgres/Supabase), a proteção vem de `SELECT ... FOR UPDATE` — trava a linha do saldo no banco até a transação terminar. Qualquer chamada concorrente para a mesma conta espera na fila; contas diferentes continuam paralelas, sem se bloquear.

Este repo demonstra o mesmo princípio de duas formas:

- **`sql/atomic_debit_function.sql`** — a função Postgres real (row-level lock)
- **`src/`** — uma simulação em Node.js com lock em memória por conta, para ilustrar e testar o conceito sem depender de um banco rodando

## Prova em teste

```bash
npm test
```

Três testes automatizados:

1. **`unsafeDebit`** sob 10 chamadas concorrentes em uma conta com 5 créditos → prova o overdraft
2. **`safeDebit`** nas mesmas condições → exatamente 5 sucessos, saldo nunca negativo
3. **Contas diferentes não se bloqueiam** → prova que o lock é por recurso, não uma trava global que mataria a performance

## Estrutura

```
sql/
  atomic_debit_function.sql   — função Postgres de produção (row-level lock)
src/
  unsafeDebit.js               — versão com bug, só para documentar o problema
  safeDebit.js                 — versão protegida (lock em memória por conta)
test/
  raceCondition.test.js        — prova automatizada do bug e da correção
```

## O que este repo NÃO é

Extração didática do mecanismo de locking — não inclui o fluxo completo de negócio (geração de documento, estorno automático em caso de falha downstream, versionamento), autenticação, nem qualquer dado de cliente. O sistema completo roda em produção como parte de um SaaS de geração de propostas comerciais.

## Stack no sistema de produção (para contexto)

React/Vite · Supabase (Postgres + RLS + RPC) · Puppeteer (geração de PDF) · Stripe

---

MIT License · Daniel Cruz
