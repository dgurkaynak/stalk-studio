import EventEmitterExtra from 'event-emitter-extra';

export enum AxisEvent {
  TRANSLATED = 'axis_translated',
  ZOOMED = 'axis_zoomed',
  UPDATED = 'axis_updated'
}

export default class Axis extends EventEmitterExtra {
  private scale: number;
  private offset: number;
  private minScale: number;

  constructor(
    private inputRange: [number, number],
    private outputRange: [number, number]
  ) {
    super();

    this.scale = (outputRange[1] - outputRange[0]) / (inputRange[1] - inputRange[0]);
    this.offset = outputRange[0] - (this.scale * inputRange[0]);
    this.minScale = this.scale;
  }

  updateOutputRange(outputRange: [number, number]) {
    this.outputRange = outputRange;
    this.minScale = (outputRange[1] - outputRange[0]) / (this.inputRange[1] - this.inputRange[0]);

    if (this.scale < this.minScale) {
      this.scale = this.minScale;
      this.offset = outputRange[0] - (this.scale * this.inputRange[0]);
    }

    this.preventTranslatingOutOfRange();
    this.emit(AxisEvent.UPDATED);
  }

  input2output(x: number) {
    return x * this.scale + this.offset;
  }

  output2input(y: number) {
    return (y - this.offset) / this.scale;
  }

  zoom(factor: number, anchorOutputPoint: number) {
    const newScale = Math.max(this.scale * factor, this.minScale);
    if (newScale === this.scale) return;
    this.scale = newScale;
    this.offset = anchorOutputPoint * (1 - factor) + (this.offset * factor);
    this.preventTranslatingOutOfRange();
    this.emit(AxisEvent.ZOOMED);
  }

  translate(delta: number) {
    this.offset += delta;
    this.preventTranslatingOutOfRange();
    this.emit(AxisEvent.TRANSLATED);
  }

  preventTranslatingOutOfRange() {
    const minInput = this.inputRange[0];
    const minOutput = this.input2output(minInput);
    if (minOutput > this.outputRange[0]) {
      this.offset += this.outputRange[0] - minOutput;
    }

    const maxInput = this.inputRange[1];
    const maxOutput = this.input2output(maxInput);
    if (maxOutput < this.outputRange[1]) {
      this.offset += this.outputRange[1] - maxOutput;
    }
  }
}
