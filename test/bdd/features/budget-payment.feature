# language: pt
Funcionalidade: Orçamento e pagamento da ordem de serviço
  Como oficina mecânica
  Quero cobrar o cliente apenas por orçamentos aprovados
  Para que a execução só comece com o pagamento confirmado

  Contexto:
    Dado um orçamento gerado para uma ordem de serviço de 211.00

  Cenário: Orçamento aprovado e pago
    Quando o cliente aprova o orçamento
    Então o orçamento fica com status "AWAITING_PAYMENT"
    E o cliente recebe o link de pagamento
    Quando o provedor notifica o pagamento como "approved"
    Então o orçamento fica com status "PAID"
    E a saga é informada com "billing.event.payment-confirmed"

  Cenário: Pagamento recusado
    Quando o cliente aprova o orçamento
    E o provedor notifica o pagamento como "rejected"
    Então o orçamento fica com status "PAYMENT_FAILED"
    E a saga é informada com "billing.event.payment-failed"

  Cenário: Estorno como compensação da saga
    Quando o cliente aprova o orçamento
    E o provedor notifica o pagamento como "approved"
    E a saga solicita o cancelamento do orçamento
    Então o orçamento fica com status "REFUNDED"
    E a saga é informada com "billing.event.payment-refunded"
