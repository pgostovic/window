import React, { FC } from 'react';

import { Scroller } from '../src';

const rows: string[][] = [];

for (let r = 0; r < 100; r++) {
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
    <p>Hold ALT-CMD while scrolling to show the window overflow.</p>
    <Scroller
      allowShowOverflow
      style={{ height: '500px', marginTop: '50px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName="theCell"
      colWidth={c => (c === 3 ? 'natural' : 100)}
      stickyRows={[1, 3, 10]}
      stickyCols={[5, 10, 15]}
      cellSpan={({ row, col }) =>
        row === 1 && col === 20
          ? { rows: 1, cols: 10 }
          : row === 20 && col === 20
          ? { rows: 3, cols: 3 }
          : { rows: 1, cols: 1 }
      }
      cellEventTypes={['mousedown', 'mouseup', 'mouseenter', 'mouseleave', 'dragstart']}
      onCellEvent={(type, cell) => console.log('EVENT', type, cell)}
      fixedMarginContent={{
        top: {
          height: 50,
          node: <div style={{ backgroundColor: 'pink', height: '50px' }}>Bubba</div>,
        },
      }}
    >
      {(cell, { row, col }) =>
        row === 1 ? (
          <div style={{ backgroundColor: '#eee', width: '100%', height: '100%' }}>Big Header</div>
        ) : row === 20 && col === 20 ? (
          <div key="spanner" className="spanner">
            {cell}
          </div>
        ) : col === 3 ? (
          <div style={{ whiteSpace: 'nowrap', minWidth: `50px` }}>{cell}</div>
        ) : (
          <>{cell}</>
        )
      }
    </Scroller>
  </>
);
