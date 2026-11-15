import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BudgetRepository } from '../../application/ports/ports';
import { Budget, BudgetItem, BudgetStatus } from '../../domain/budget';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaBudgetRepository implements BudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(budget: Budget): Promise<void> {
    const data = {
      status: budget.status,
      checkoutId: budget.checkoutId,
      checkoutUrl: budget.checkoutUrl,
      paymentId: budget.paymentId,
    };
    await this.prisma.budget.upsert({
      where: { id: budget.id },
      create: {
        id: budget.id,
        orderId: budget.orderId,
        customerId: budget.customer.id,
        customerName: budget.customer.name,
        customerEmail: budget.customer.email,
        items: budget.items as unknown as Prisma.InputJsonValue,
        totalAmount: budget.totalAmount,
        createdAt: budget.createdAt,
        ...data,
      },
      update: data,
    });
  }

  async findByOrderId(orderId: string): Promise<Budget | null> {
    const record = await this.prisma.budget.findUnique({ where: { orderId } });
    return (
      record &&
      Budget.restore({
        id: record.id,
        orderId: record.orderId,
        customer: { id: record.customerId, name: record.customerName, email: record.customerEmail },
        items: record.items as unknown as BudgetItem[],
        totalAmount: Number(record.totalAmount),
        status: record.status as BudgetStatus,
        checkoutId: record.checkoutId,
        checkoutUrl: record.checkoutUrl,
        paymentId: record.paymentId,
        createdAt: record.createdAt,
      })
    );
  }
}
