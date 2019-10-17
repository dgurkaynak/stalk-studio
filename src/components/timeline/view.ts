import * as _ from 'lodash';
import { Stage } from '../../model/stage';
import GroupView, { GroupViewEvent } from './group-view';
import Axis from './axis';
import ViewSettings from './view-settings';
import EventEmitterExtra from 'event-emitter-extra';
import AnnotationManager from './annotations/manager';
import LogHighlightAnnotation from './annotations/log-highlight';
import MouseHandler, { MouseHandlerEvent } from './mouse-handler';
import SpanView from './span-view';
import { Trace } from '../../model/trace';

const SVG_NS = 'http://www.w3.org/2000/svg';

export enum TimelineViewEvent {
  SPAN_CLICKED = 't_span_selected',
  LOG_CLICKED = 't_log_clicked',
  HOVER_CHANGED = 't_hover_changed',
}


export default class TimelineView extends EventEmitterExtra {
  private svg = document.createElementNS(SVG_NS, 'svg');

  private defs = document.createElementNS(SVG_NS, 'defs');
  private viewportClipPath = document.createElementNS(SVG_NS, 'clipPath');
  private viewportClipPathRect = document.createElementNS(SVG_NS, 'rect');
  private cursorLine = document.createElementNS(SVG_NS, 'line');

  private viewportContainer = document.createElementNS(SVG_NS, 'g');
  private groupNamePanel = document.createElementNS(SVG_NS, 'g');
  private timelinePanel = document.createElementNS(SVG_NS, 'g');
  private annotationUnderlayPanel = document.createElementNS(SVG_NS, 'g');
  private annotationOverlayPanel = document.createElementNS(SVG_NS, 'g');
  private panelTranslateY = 0;

  private mouseHandler = new MouseHandler(this.svg);
  private hoveredElements: { type: string, element: Element }[] = [];

  private stage?: Stage;
  private viewSettings = new ViewSettings();
  private groupViews: GroupView[] = [];
  private contentHeight = 0; // in pixels
  private sidebarWidth = 0;

  annotation = new AnnotationManager({
    timelineView: this,
    underlayPanel: this.annotationUnderlayPanel,
    overlayPanel: this.annotationOverlayPanel,
    viewSettings: this.viewSettings
  });

  private binded = {
    onMouseIdleMove: this.onMouseIdleMove.bind(this),
    onMouseIdleLeave: this.onMouseIdleLeave.bind(this),
    onWheel: this.onWheel.bind(this),
    onMousePanStart: this.onMousePanStart.bind(this),
    onMousePanMove: this.onMousePanMove.bind(this),
    onClick: this.onClick.bind(this),
    onDoubleClick: this.onDoubleClick.bind(this),
  };


  constructor(options?: {
    viewSettings?: ViewSettings
  }) {
    super();

    if (options && options.viewSettings) this.viewSettings = options.viewSettings;
    this.svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink');
    this.svg.classList.add('timeline-svg');

    this.cursorLine.setAttribute('x1', '0');
    this.cursorLine.setAttribute('x2', '0');
    this.cursorLine.setAttribute('y1', '0');
    this.cursorLine.setAttribute('stroke', '#cccccc');
    this.cursorLine.setAttribute('stroke-width', '1');
    this.cursorLine.style.display = 'none';
    this.svg.appendChild(this.cursorLine);
  }


  init(parentElement: HTMLElement, options?: {
    width?: number,
    height?: number,
  }) {
    let width = options && options.width;
    let height = options && options.height;
    if (!width || !height) {
      const { offsetWidth, offsetHeight } = parentElement;
      width = offsetWidth;
      height = offsetHeight;
    }
    this.resize(width, height);
    this.setupPanels();
    this.bindEvents();
    this.mouseHandler.init();

    parentElement.appendChild(this.svg);
  }


  resize(width: number, height: number) {
    this.viewSettings.width = width;
    this.viewSettings.height = height;

    this.svg.setAttribute('width', `${width}`);
    this.svg.setAttribute('height', `${height}`);
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    this.cursorLine.setAttribute('y2', this.viewSettings.height + '');

    this.viewportClipPathRect.setAttribute('width', `${width}`);
    this.viewportClipPathRect.setAttribute('height', `${height}`);

    this.viewSettings.getAxis().updateOutputRange([
      this.viewSettings.spanBarViewportMargin,
      this.viewSettings.width - this.viewSettings.spanBarViewportMargin - this.sidebarWidth
    ]);

    this.groupViews.forEach(v => v.updateSeperatorLineWidths());
  }


  setupPanels() {
    const { width, height } = this.viewSettings;

    this.viewportClipPath.id = 'viewport-clip-path';
    this.viewportClipPathRect.setAttribute('x', `0`);
    this.viewportClipPathRect.setAttribute('y', `0`);
    this.viewportClipPathRect.setAttribute('width', `${width}`);
    this.viewportClipPathRect.setAttribute('height', `${height}`);
    this.viewportClipPath.appendChild(this.viewportClipPathRect);
    this.defs.appendChild(this.viewportClipPath);

    this.svg.appendChild(this.defs);

    this.viewportContainer.setAttribute('clip-path', 'url(#viewport-clip-path)');
    this.viewportContainer.appendChild(this.groupNamePanel);
    this.viewportContainer.appendChild(this.annotationUnderlayPanel);
    this.viewportContainer.appendChild(this.timelinePanel);
    this.viewportContainer.appendChild(this.annotationOverlayPanel);
    this.svg.appendChild(this.viewportContainer);
  }

  bindEvents() {
    this.mouseHandler.on(MouseHandlerEvent.IDLE_MOVE, this.binded.onMouseIdleMove);
    this.mouseHandler.on(MouseHandlerEvent.IDLE_LEAVE, this.binded.onMouseIdleLeave);
    this.mouseHandler.on(MouseHandlerEvent.PAN_START, this.binded.onMousePanStart);
    this.mouseHandler.on(MouseHandlerEvent.PAN_MOVE, this.binded.onMousePanMove);
    this.mouseHandler.on(MouseHandlerEvent.WHEEL, this.binded.onWheel);
    this.mouseHandler.on(MouseHandlerEvent.CLICK, this.binded.onClick);
    this.mouseHandler.on(MouseHandlerEvent.DOUBLE_CLICK, this.binded.onDoubleClick);
  }

  onMouseIdleMove(e: MouseEvent) {
    // Update the cursor line
    this.cursorLine.setAttribute('transform', `translate(${e.offsetX}, 0)`);

    // TODO: Maybe debounce below?
    const matches = this.getViewsFromMouseEvent(e);

    this.showOrHideLogHighlightAnnotation(null);

    matches.forEach(({ type, element }) => {
      switch (type) {

        case SpanView.ViewType.LOG_CIRCLE:
        case LogHighlightAnnotation.ViewType.CIRCLE: {
          const spanId = element.getAttribute('data-span-id');
          const logId = element.getAttribute('data-log-id');
          if (!spanId || !logId) return;
          const spanView = this.annotation.findSpanView(spanId)[1];
          if (!spanView) return;
          this.showOrHideLogHighlightAnnotation({ spanView: spanView, logId });
          return;
        }

      }
    });

    const previousHoveredElements = this.hoveredElements;
    this.hoveredElements = matches;

    const removed: {
      type: string,
      element: Element
    }[] = _.differenceBy(previousHoveredElements, matches, ({element}) => element);
    const added: {
      type: string,
      element: Element
    }[] = _.differenceBy(matches, previousHoveredElements, ({element}) => element);

    if (removed.length === 0 && added.length === 0) return;
    this.emit(TimelineViewEvent.HOVER_CHANGED, { added, removed, current: matches });
  }

  onMouseIdleLeave(e: MouseEvent) {
    // Hide cursor line
    this.cursorLine.setAttribute('transform', `translate(-1, 0)`);
  }

  onMousePanStart(e: MouseEvent) {
    // Hide cursor line
    this.cursorLine.setAttribute('transform', `translate(-1, 0)`);
  }

  onMousePanMove(e: MouseEvent) {
    const { height: viewportHeight } = this.viewSettings;
    if (this.contentHeight <= viewportHeight) {
      // No vertical panning
    } else {
      const newTranslateY = this.panelTranslateY + e.movementY;
      this.panelTranslateY = Math.min(Math.max(newTranslateY, viewportHeight - this.contentHeight), 0);
    }

    this.viewSettings.getAxis().translate(e.movementX);

    this.groupNamePanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);
    this.timelinePanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);
    this.annotationUnderlayPanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);
    this.annotationOverlayPanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);
  }

  onWheel(e: WheelEvent) {
    if (!this.stage) return;

    this.viewSettings.getAxis().zoom(
      1 - (this.viewSettings.scrollToZoomFactor * e.deltaY),
      e.offsetX
    );

    this.showOrHideLogHighlightAnnotation(null);
  }

  // Array order is from deepest element to root
  getViewsFromMouseEvent(e: MouseEvent) {
    let element = e.target as (Element | null);
    const matches: { type: string, element: Element }[] = [];

    while (element && element !== this.svg) {
      if (element.hasAttribute('data-view-type')) {
        matches.push({
          type: element.getAttribute('data-view-type')!,
          element: element
        });
      }
      element = element.parentElement;
    }

    return matches;
  }

  onClick(e: MouseEvent) {
    if (!e) return;
    const matches = this.getViewsFromMouseEvent(e);

    matches.forEach(({ type, element }) => {
      switch (type) {

        case LogHighlightAnnotation.ViewType.CIRCLE: {
          const spanId = element.getAttribute('data-span-id');
          const logId = element.getAttribute('data-log-id');
          if (!spanId || !logId) return;
          const spanView = this.annotation.findSpanView(spanId)[1];
          if (!spanView) return;
          this.emit(TimelineViewEvent.SPAN_CLICKED, spanView);
          this.emit(TimelineViewEvent.LOG_CLICKED, { spanId, logId });
          return;
        }

        case SpanView.ViewType.CONTAINER: {
          const spanId = element.getAttribute('data-span-id');
          if (!spanId) return;
          const spanView = this.annotation.findSpanView(spanId)[1];
          if (!spanView) return;
          spanView && this.emit(TimelineViewEvent.SPAN_CLICKED, spanView);
          return;
        }

      }
    });

  }

  onDoubleClick(e: MouseEvent) {
    if (!e) return;
    const matches = this.getViewsFromMouseEvent(e);
    matches.forEach(({ type, element }) => {
      switch (type) {

        case SpanView.ViewType.LOG_CIRCLE:
        case LogHighlightAnnotation.ViewType.CIRCLE: {
          // NOOP
          return;
        }

        case GroupView.ViewType.LABEL_TEXT: {
          const groupId = element.getAttribute('data-group-id');
          if (!groupId) return;
          const groupView = _.find(this.groupViews, v => v.group.id === groupId);
          if (!groupView) return;
          groupView && groupView.toggleView();
          return;
        }

        case SpanView.ViewType.CONTAINER: {
          const spanId = element.getAttribute('data-span-id');
          if (!spanId) return;
          const [groupView] = this.annotation.findSpanView(spanId);
          groupView && groupView.toggleSpanView(spanId);
          return;
        }

      }
    });

  }

  dispose() {
    this.mouseHandler.dispose();
  }

  addTrace(trace: Trace) {

  }

  removeTrace(trace: Trace) {

  }

  // updateData(stage: Stage) {
  //   this.stage = stage;
  //   const grouping = stage.grouping[this.settings.grouping];

  //   const { startTimestamp, finishTimestamp } = stage.group;
  //   this.settings.setAxis(new Axis(
  //     [startTimestamp, finishTimestamp],
  //     [
  //       this.settings.spanBarViewportMargin,
  //       this.settings.width - this.settings.spanBarViewportMargin - this.sidebarWidth
  //     ]
  //   ));

  //   this.groupViews.forEach(v => v.dispose()); // This will unbind all handlers, no need to manually remove listener
  //   this.groupViews = [];

  //   const groups = grouping.getAllGroups().sort((a, b) => a.startTimestamp - b.startTimestamp);
  //   groups.forEach((group) => {
  //     const groupView = new GroupView({ group, viewSettings: this.settings });
  //     groupView.init({
  //       groupNamePanel: this.groupNamePanel,
  //       timelinePanel: this.timelinePanel,
  //       svgDefs: this.defs
  //     });
  //     groupView.layout();

  //     // Bind layout event after initial layout
  //     groupView.on(GroupViewEvent.LAYOUT, this.onGroupLayout.bind(this));

  //     this.groupViews.push(groupView);
  //   });

  //   this.updateGroupPositions();

  //   // Annotations
  //   this.annotation.updateData(this.groupViews);

  //   // Reset vertical panning
  //   this.panelTranslateY = 0;
  //   this.groupNamePanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);
  //   this.timelinePanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);
  //   this.annotationUnderlayPanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);
  //   this.annotationOverlayPanel.setAttribute('transform', `translate(0, ${this.panelTranslateY})`);

  //   // Show & hide cursor line
  //   this.cursorLine.style.display = groups.length > 0 ? '' : 'none';
  // }

  onGroupLayout() {
    this.updateGroupPositions();
  }

  updateGroupPositions() {
    const { groupPaddingTop, groupPaddingBottom, rowHeight } = this.viewSettings;
    let y = 0;

    this.groupViews.forEach((groupView, i) => {
      groupView.updatePosition({ y });
      if (groupView.options.isCollapsed) {
        y += groupPaddingTop;
      } else {
        y += groupPaddingTop + groupPaddingBottom + (groupView.heightInRows * rowHeight);
      }
    });

    this.contentHeight = y;
  }

  getContentHeight() {
    return this.contentHeight;
  }

  updateSidebarWidth(width: number) {
    this.sidebarWidth = width;
    this.viewSettings.getAxis().updateOutputRange([
      this.viewSettings.spanBarViewportMargin,
      this.viewSettings.width - this.viewSettings.spanBarViewportMargin - this.sidebarWidth
    ]);
  }

  showOrHideLogHighlightAnnotation(options: { spanView: SpanView, logId: string } | null) {
    if (!options) return this.annotation.logHighlightAnnotation.unmount();
    this.annotation.logHighlightAnnotation.prepare({ spanView: options.spanView, logId: options.logId });
    this.annotation.logHighlightAnnotation.update();
    this.annotation.logHighlightAnnotation.mount();
  }
}
