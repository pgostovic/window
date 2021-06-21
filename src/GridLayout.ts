const DEFAULT_MIN_CELLS_RECT_UPDATE_INTERVAL = 50;
const DEFAULT_EXCESS_RENDER_X = 3;
const DEFAULT_EXCESS_RENDER_Y = 3;

interface Updates {
  translate: { x: number; y: number };
  cellsRect: WindowCellsRect;
  stuckRows: StuckRows;
  stuckCols: StuckCols;
}
type UpdateHandler = (updates: Partial<Updates> & { translate: { x: number; y: number } }) => void;
export type StuckRows = { [row: number]: { y: number; height: number } };
export type StuckCols = { [col: number]: { x: number; width: number } };
export type WindowCellsRect = { row: number; col: number; numRows: number; numCols: number };
type WindowPxRect = { x: number; y: number; width: number; height: number };

export default class GridLayout {
  private rowPositions: { y: number; height: number }[];
  private colPositions: { x: number; width: number }[];
  private gridPxSize: { width: number; height: number };
  private windowPxRect: WindowPxRect;
  private windowCellsRect: WindowCellsRect;
  private stickyRows: number[];
  private stickyCols: number[];
  private stuckRows: StuckRows;
  private stuckCols: StuckCols;
  private excessRenderX = DEFAULT_EXCESS_RENDER_X;
  private excessRenderY = DEFAULT_EXCESS_RENDER_Y;
  private minCellsRectUpdateInterval = DEFAULT_MIN_CELLS_RECT_UPDATE_INTERVAL;
  private lastCellsRectUpdateTime = 0;
  private updates?: Updates;
  public updateHandler: UpdateHandler = () => undefined;

  constructor() {
    this.rowPositions = [];
    this.colPositions = [];
    this.gridPxSize = { width: 0, height: 0 };
    this.windowPxRect = { x: 0, y: 0, width: 0, height: 0 };
    this.windowCellsRect = { row: 0, col: 0, numRows: 0, numCols: 0 };
    this.stickyRows = [];
    this.stickyCols = [];
    this.stuckRows = {};
    this.stuckCols = {};
  }

  getGridSize() {
    return this.gridPxSize;
  }

  setRowHeights(rowHeights: number[]) {
    const rowPositions: { y: number; height: number }[] = [];
    let prev = { y: 0, height: 0 };
    for (let i = 0; i < rowHeights.length; i += 1) {
      const pos = { height: rowHeights[i], y: prev.y + prev.height };
      rowPositions.push(pos);
      prev = pos;
    }
    this.rowPositions = rowPositions;
    this.gridPxSize.height = prev.y + prev.height;
  }

  setColWidths(colWidths: number[]) {
    const colPositions: { x: number; width: number }[] = [];
    let prev = { x: 0, width: 0 };
    for (let i = 0; i < colWidths.length; i += 1) {
      const pos = { width: colWidths[i], x: prev.x + prev.width };
      colPositions.push(pos);
      prev = pos;
    }
    this.colPositions = colPositions;
    this.gridPxSize.width = prev.x + prev.width;
  }

  setStickyRows(stickyRows: number[]) {
    this.stickyRows = [...stickyRows].sort((a, b) => a - b);
  }

  setStickyCols(stickyCols: number[]) {
    this.stickyCols = [...stickyCols].sort((a, b) => a - b);
  }

  getRowPositions() {
    return this.rowPositions;
  }

  getColPositions() {
    return this.colPositions;
  }

  setWindowSize(width: number, height: number) {
    this.windowPxRect.width = width;
    this.windowPxRect.height = height;
    this.computeUpdates();
    this.commitUpdates(true);
  }

  getWindowRect() {
    return this.windowPxRect;
  }

  moveToTop() {
    this.moveWindow(this.windowPxRect.x, 0);
  }

  moveToBottom() {
    this.moveWindow(this.windowPxRect.x, this.gridPxSize.height - this.windowPxRect.height);
  }

  moveToLeft() {
    this.moveWindow(0, this.windowPxRect.y);
  }

  moveToRight() {
    this.moveWindow(this.gridPxSize.width - this.windowPxRect.width, this.windowPxRect.y);
  }

  pageUp() {
    const stuckRowsHeight = Object.values(this.stuckRows).reduce((h, sr) => h + sr.height, 0);
    this.moveWindowBy(0, -(this.windowPxRect.height - stuckRowsHeight));
  }

  pageDown() {
    const stuckRowsHeight = Object.values(this.stuckRows).reduce((h, sr) => h + sr.height, 0);
    this.moveWindowBy(0, this.windowPxRect.height - stuckRowsHeight);
  }

  moveWindowBy(dx: number, dy: number) {
    this.moveWindow(this.windowPxRect.x + dx, this.windowPxRect.y + dy);
  }

  moveWindow(x: number, y: number) {
    const { width, height } = this.gridPxSize;
    this.windowPxRect.x = Math.min(Math.max(0, x), width - this.windowPxRect.width);
    this.windowPxRect.y = Math.min(Math.max(0, y), height - this.windowPxRect.height);
    this.computeUpdates();
    this.commitUpdates();
  }

  /**
   * This method computes the following based on the current window position:
   * - windowCellsRect: which cells should be rendered
   * - stuckRows: which of the sticky rows are stuck
   * - stuckCols: which of the sticky cols are stuck
   * - translate: the translation that should be applied
   * These computed updates are not applied to the state, rather they are only staged.
   */
  private computeUpdates() {
    // Find the row that straddles the top boundary of the window rect.
    let row = this.windowCellsRect.row;
    let numRows = 0;
    let rowPos = this.rowPositions[row];
    const dirY = rowPos.y > this.windowPxRect.y ? -1 : 1;
    while (
      rowPos &&
      (rowPos.y > this.windowPxRect.y ||
        rowPos.y + /* rowPos.height could be -1 (natural height) */ Math.max(0, rowPos.height) < this.windowPxRect.y)
    ) {
      row += dirY;
      rowPos = this.rowPositions[row];
    }
    // Apply excess to top.
    row = Math.max(0, row - this.excessRenderY);
    rowPos = this.rowPositions[row];

    // Find the row that straddles the bottom boundary of the window rect.
    const bottom = this.windowPxRect.y + this.windowPxRect.height;
    while (rowPos && rowPos.y < bottom) {
      numRows += 1;
      rowPos = this.rowPositions[row + numRows];
    }
    // Apply excess to bottom.
    const rowsLeft = this.rowPositions.length - row - numRows;
    numRows += Math.min(this.excessRenderY, rowsLeft);
    rowPos = this.rowPositions[row + numRows];

    // Find the col that straddles the left boundary of the window rect.
    let col = this.windowCellsRect.col;
    let numCols = 0;
    let colPos = this.colPositions[col];
    const dirX = colPos.x > this.windowPxRect.x ? -1 : 1;
    while (
      colPos &&
      (colPos.x > this.windowPxRect.x ||
        colPos.x + /* colPos.width could be -1 (natural width) */ Math.max(0, colPos.width) < this.windowPxRect.x)
    ) {
      col += dirX;
      colPos = this.colPositions[col];
    }
    // Apply excess to left.
    col = Math.max(0, col - this.excessRenderX);
    colPos = this.colPositions[col];

    // Find the col that straddles the right boundary of the window rect.
    const right = this.windowPxRect.x + this.windowPxRect.width;
    while (colPos && colPos.x < right) {
      numCols += 1;
      colPos = this.colPositions[col + numCols];
    }
    // Apply excess to right.
    const colsLeft = this.colPositions.length - col - numCols;
    numCols += Math.min(this.excessRenderX, colsLeft);
    colPos = this.colPositions[col + numCols];

    this.updates = {
      translate: { x: -this.windowPxRect.x, y: -this.windowPxRect.y },
      cellsRect: { row, col, numRows, numCols },
      stuckRows: this.getStuckRows(),
      stuckCols: this.getStuckCols(),
    };
  }

  /**
   * This menthod determines which of the staged updates should actually be applied a the
   * current time, and then passes these updates to the `updateHandler`. The applied updates
   * are finally committed to the state.
   *
   * @param forceImmediate whether to bypass any throttling.
   */
  private commitUpdates(forceImmediate = false) {
    if (this.updates) {
      const now = performance.now();
      const shouldUpdateCellsRect =
        (forceImmediate || now - this.lastCellsRectUpdateTime > this.minCellsRectUpdateInterval) &&
        (Math.abs(this.updates.cellsRect.row - this.windowCellsRect.row) >= this.excessRenderY ||
          Math.abs(this.updates.cellsRect.col - this.windowCellsRect.col) >= this.excessRenderX ||
          Math.abs(this.updates.cellsRect.numRows - this.windowCellsRect.numRows) >= this.excessRenderY ||
          Math.abs(this.updates.cellsRect.numCols - this.windowCellsRect.numCols) >= this.excessRenderX);

      const stuckRowsChanged = Object.keys(this.updates.stuckRows).join() !== Object.keys(this.stuckRows).join();
      const stuckColsChanged = Object.keys(this.updates.stuckCols).join() !== Object.keys(this.stuckCols).join();

      const updates = {
        ...this.updates,
        cellsRect: shouldUpdateCellsRect ? this.updates.cellsRect : undefined,
        stuckRows: forceImmediate || stuckRowsChanged ? this.updates.stuckRows : undefined,
        stuckCols: forceImmediate || stuckColsChanged ? this.updates.stuckCols : undefined,
      };

      this.updateHandler(updates);

      if (updates.cellsRect) {
        this.windowCellsRect = updates.cellsRect;
        this.lastCellsRectUpdateTime = now;
      }

      if (updates.stuckRows) {
        this.stuckRows = updates.stuckRows;
      }

      if (updates.stuckCols) {
        this.stuckCols = updates.stuckCols;
      }

      this.updates = undefined;
    }
  }

  private getStuckRows() {
    const stuckRows: StuckRows = {};
    let prev = { y: 0, height: 0 };
    for (let i = 0; i < this.stickyRows.length; i += 1) {
      const row = this.stickyRows[i];
      const y = prev.y + prev.height;
      const rowPos = this.rowPositions[row];
      if (rowPos.y - y < this.windowPxRect.y) {
        const stuckRowPos = { height: rowPos.height, y };
        stuckRows[row] = stuckRowPos;
        prev = stuckRowPos;
      } else {
        break;
      }
    }
    return stuckRows;
  }

  private getStuckCols() {
    const stuckCols: StuckCols = {};
    let prev = { x: 0, width: 0 };
    for (let i = 0; i < this.stickyCols.length; i += 1) {
      const col = this.stickyCols[i];
      const x = prev.x + prev.width;
      const colPos = this.colPositions[col];
      if (colPos.x - x < this.windowPxRect.x) {
        const stuckColPos = { width: colPos.width, x };
        stuckCols[col] = stuckColPos;
        prev = stuckColPos;
      } else {
        break;
      }
    }
    return stuckCols;
  }
}
