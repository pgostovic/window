import React, { FC } from 'react';

import { GridScroller } from '../../src';

const rows: string[][] = [];

for (let r = 0; r < 1000; r++) {
  const row: string[] = [];
  for (let c = 0; c < 1000; c++) {
    row.push(`${c}-${r}`);
  }
  rows.push(row);
}

const theStyle = `
  .spanner {
    background-color: #eee;
    width: 100%;
    height: 100%;
  }

  .highlighted {
    background-color: #9e9;
  }

  .theCell {
    border-top: 1px solid #ccc;
    border-left: 1px solid #ccc;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .stickyRows {
    border-bottom: 2px solid #999;  
  }

  .stickyCols {
    border-right: 2px solid #999;
  }

  .stickyCells {
    border-bottom: 2px solid #999;
    border-right: 2px solid #999;
  }
`;

export const BasicGrid: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={() => 'theCell'}
      logPerfStats
    />
  </>
);

export const StickyRows: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={() => 'theCell'}
      stickyRows={[5, 10]}
    />
  </>
);

export const StickyCols: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={() => 'theCell'}
      stickyCols={[5, 10]}
    />
  </>
);

export const StickyRowsAndCols: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={() => 'theCell'}
      stickyRows={[5, 10]}
      stickyCols={[5, 10]}
    />
  </>
);

export const CellSpan: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={({ row, col }) => (row === 5 && col === 5 ? 'theCell spanner' : 'theCell')}
      cellSpans={[{ row: 5, col: 5, rows: 3, cols: 3 }]}
    />
  </>
);

// export const CellSpanFitWindow: FC = () => (
//   <>
//     <style>{theStyle}</style>
//     <Scroller
//       style={{ height: '500px', backgroundColor: '#ddd' }}
//       rows={rows}
//       cellClassName={({ row, col }) => (row === 5 && col === 5 ? 'theCell spanner' : 'theCell')}
//       cellSpans={[{ row: 5, col: 5, rows: 1, cols: 'fitWindow' }]}
//     />
//   </>
// );

export const SuppressHorizontalScroll: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={({ row }) => (row === 5 || row === 10 ? 'theCell highlighted' : 'theCell')}
      vRows={[5, 10]}
      cellSpans={[{ row: 10, col: 0, rows: 1, cols: 'window' }]}
      stickyRows={[5, 7]}
    />
  </>
);

export const SuppressVerticalScroll: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={({ col }) => (col === 5 || col === 10 ? 'theCell spanner' : 'theCell')}
      hCols={[5, 10]}
      cellSpans={[{ row: 0, col: 10, cols: 1, rows: 'window' }]}
      stickyCols={[5]}
    />
  </>
);

export const GridWithEvents: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={() => 'theCell'}
      cellEventTypes={['mousedown', 'mouseup', 'mouseenter', 'mouseleave']}
      onCellEvent={(type, cell) => console.log('EVENT', type, cell)}
    />
  </>
);

export const GridWithFixedMarginContent: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      stickyRows={[5, 10]}
      stickyCols={[5, 10]}
      cellClassName={() => 'theCell'}
      arrowScrollAmount={50}
      fixedMargin={{
        top: {
          height: 50,
          node: (
            <div
              style={{
                backgroundColor: '#666',
                color: '#fff',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Top
            </div>
          ),
        },
        bottom: {
          height: 50,
          node: (
            <div
              style={{
                backgroundColor: '#666',
                color: '#fff',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Bottom
            </div>
          ),
        },
        left: {
          width: 50,
          node: (
            <div
              style={{
                backgroundColor: '#555',
                color: '#fff',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Left
            </div>
          ),
        },
        right: {
          width: 50,
          node: (
            <div
              style={{
                backgroundColor: '#555',
                color: '#fff',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Right
            </div>
          ),
        },
      }}
    />
  </>
);

export const GridWithArrowScroll: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      arrowScrollAmount={50}
      cellClassName={() => 'theCell'}
    />
  </>
);
