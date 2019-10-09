import { Grouping } from './grouping';
import { Span } from '../span';


export class ProcessGrouping extends Grouping {
    constructor() {
        super({
            key: 'process',
            name: 'Process',
            groupBy: (span: Span) => {
                let processId = 'unknown';
                let processName = 'unknown';

                // jaeger
                if (span.process) {
                    processId = span.process.id;
                    processName = `${span.process.serviceName} ${processId}`;
                }

                // zipkin
                if (span.localEndpoint) {
                    const ipv4 = span.localEndpoint.ipv4 || '';
                    const port = span.localEndpoint.port || '';
                    processId = `${span.localEndpoint.serviceName}:${ipv4}:${port}`;
                    processName = span.localEndpoint.serviceName;
                    if (ipv4 || port) {
                        processName += ` (${ipv4}:${port})`;
                    }
                }

                return [ processId, processName ];
            }
        });
    }
}


export default ProcessGrouping;