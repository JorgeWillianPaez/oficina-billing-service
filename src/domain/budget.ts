import { randomUUID } from 'node:crypto';
import { DomainError } from './errors';

export enum BudgetStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

const OPEN_STATUSES = [BudgetStatus.PENDING_APPROVAL, BudgetStatus.AWAITING_PAYMENT];

export interface BudgetItem {
  type: 'SERVICE' | 'PART';
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface BudgetCustomer {
  id: string;
  name: string;
  email: string;
}

export interface BudgetProps {
  id: string;
  orderId: string;
  customer: BudgetCustomer;
  items: BudgetItem[];
  totalAmount: number;
  status: BudgetStatus;
  checkoutId: string | null;
  checkoutUrl: string | null;
  paymentId: string | null;
  createdAt: Date;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export class Budget {
  private constructor(private readonly props: BudgetProps) {}

  static generate(
    input: { orderId: string; customer: BudgetCustomer; items: BudgetItem[] },
    now = new Date(),
  ): Budget {
    if (!input.orderId) throw new DomainError('Budget requires a service order');
    if (!input.customer?.id || !input.customer.email) {
      throw new DomainError('Budget requires an identified customer');
    }
    if (!input.items?.length) throw new DomainError('Budget requires at least one item');
    if (input.items.some((item) => !(item.unitPrice >= 0) || !(item.quantity > 0))) {
      throw new DomainError('Budget items must have valid price and quantity');
    }
    return new Budget({
      id: randomUUID(),
      orderId: input.orderId,
      customer: input.customer,
      items: input.items,
      totalAmount: roundMoney(
        input.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
      ),
      status: BudgetStatus.PENDING_APPROVAL,
      checkoutId: null,
      checkoutUrl: null,
      paymentId: null,
      createdAt: now,
    });
  }

  static restore(props: BudgetProps): Budget {
    return new Budget(props);
  }

  get id() {
    return this.props.id;
  }

  get orderId() {
    return this.props.orderId;
  }

  get customer() {
    return this.props.customer;
  }

  get items(): readonly BudgetItem[] {
    return this.props.items;
  }

  get totalAmount() {
    return this.props.totalAmount;
  }

  get status() {
    return this.props.status;
  }

  get checkoutId() {
    return this.props.checkoutId;
  }

  get checkoutUrl() {
    return this.props.checkoutUrl;
  }

  get paymentId() {
    return this.props.paymentId;
  }

  get createdAt() {
    return this.props.createdAt;
  }

  get isPendingApproval(): boolean {
    return this.props.status === BudgetStatus.PENDING_APPROVAL;
  }

  get isAwaitingPayment(): boolean {
    return this.props.status === BudgetStatus.AWAITING_PAYMENT;
  }

  get isPaid(): boolean {
    return this.props.status === BudgetStatus.PAID;
  }

  get isOpen(): boolean {
    return OPEN_STATUSES.includes(this.props.status);
  }

  approve(checkout: { checkoutId: string; checkoutUrl: string }): void {
    this.require(this.isPendingApproval, 'approved');
    this.props.status = BudgetStatus.AWAITING_PAYMENT;
    this.props.checkoutId = checkout.checkoutId;
    this.props.checkoutUrl = checkout.checkoutUrl;
  }

  reject(): void {
    this.require(this.isPendingApproval, 'rejected');
    this.props.status = BudgetStatus.REJECTED;
  }

  confirmPayment(paymentId: string): void {
    this.require(this.isAwaitingPayment, 'paid');
    this.props.status = BudgetStatus.PAID;
    this.props.paymentId = paymentId;
  }

  failPayment(paymentId: string): void {
    this.require(this.isAwaitingPayment, 'marked as payment failed');
    this.props.status = BudgetStatus.PAYMENT_FAILED;
    this.props.paymentId = paymentId;
  }

  refund(): void {
    this.require(this.isPaid, 'refunded');
    this.props.status = BudgetStatus.REFUNDED;
  }

  cancel(): void {
    this.require(this.isOpen, 'cancelled');
    this.props.status = BudgetStatus.CANCELLED;
  }

  private require(condition: boolean, action: string): void {
    if (!condition) throw new DomainError(`Budget in status ${this.props.status} cannot be ${action}`);
  }
}
