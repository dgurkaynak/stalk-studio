import * as _ from 'lodash';
import { Span } from './span';


export class Trace {
    readonly spans: Span[];
    readonly startTime = Infinity;
    readonly finishTime = -Infinity;
    readonly duration: number;
    readonly rootSpan: Span | undefined;
    readonly id: string;
    readonly name: string;
    readonly spanCount: number;
    readonly spanCountsByService: { [key: string]: number } = {};
    readonly errorCount: number = 0;


    constructor(spans: Span[]) {
        this.spans = spans;
        this.spanCount = spans.length;

        for (let span of spans) {
            this.startTime = Math.min(this.startTime, span.startTime);
            this.finishTime = Math.max(this.finishTime, span.finishTime);

            if (span.references.length === 0) {
                this.rootSpan = span;
            }

            const serviceName = span.process ? span.process.serviceName :
                span.localEndpoint ? span.localEndpoint.serviceName :
                null;

            if (serviceName) {
                if (!_.isNumber(this.spanCountsByService[serviceName])) {
                    this.spanCountsByService[serviceName] = 0;
                }
                this.spanCountsByService[serviceName]++;
            }

            if (span.tags.hasOwnProperty('error')) this.errorCount++;
        }

        this.duration = this.finishTime - this.startTime;
        if (!this.rootSpan) throw new Error(`Trace should contain a root span`);
        this.name = this.rootSpan.operationName;
        this.id = this.rootSpan.traceId;
    }
}


export default Trace;