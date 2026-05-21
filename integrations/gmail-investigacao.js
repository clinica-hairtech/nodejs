// Gmail investigacao - le inbox do Dr. via labels/queries pra detectar cobrancas.
// Usa Gmail MCP via API (acesso ja autorizado pelo OAuth do Drive).
// Como AV nao tem acesso direto ao MCP, este modulo expoe interface generica
// que o /admin/cobrancas-email vai chamar via fetch interno se MCP estiver dispo.

// Por enquanto este e um STUB - estrutura pra quando integrar MCP ou IMAP.
// Em producao real:
//  - usar OAuth do Workspace pra acessar Gmail API
//  - search query "from:cobranca OR subject:fatura OR subject:atraso"
//  - extrair sender, subject, preview

const QUERIES_COBRANCA = [
  'from:(cobranca OR negociacao OR financeiro OR cobrar) is:unread newer_than:30d',
  'subject:(fatura OR atraso OR debito OR boleto OR vencimento) newer_than:30d',
  'from:(itau OR bradesco OR santander OR caixa OR nubank OR inter OR c6) subject:(cobranca OR fatura) newer_than:30d',
  'from:(serasa OR spc) newer_than:60d',
  'from:(recovery OR finder OR cdc OR atrium) newer_than:60d',
];

function status() {
  return {
    implementado: false,
    nota: "Gmail MCP precisa ser invocado pelo Claude Code Web em sessao com tool ativado. Stub atual.",
    queries: QUERIES_COBRANCA,
  };
}

module.exports = { status, QUERIES_COBRANCA };
