import { Injectable, Logger } from '@nestjs/common';
import { IntegrationMonitor } from '../../application/ports/ports';
import { config } from '../../config';

@Injectable()
export class NewRelicIntegrationMonitor implements IntegrationMonitor {
  private readonly logger = new Logger('IntegrationMonitor');
  private readonly agent = config.newRelicEnabled ? require('newrelic') : undefined;

  failed(integration: string, orderId: string, error: unknown): void {
    this.logger.error({ msg: 'Integration failed', integration, orderId, err: error });
    this.agent?.recordCustomEvent('IntegrationFailure', {
      integration,
      orderId,
      message: (error as Error)?.message ?? 'unknown',
    });
  }
}
