import React, { FC, useEffect, useState } from 'react';

import { Scroller } from '../../src';

const numbers: number[] = [];
for (let i = 0; i < 100; i++) {
  numbers.push(i);
}

const sizes: number[] = [];
for (let i = 0; i < 1000; i++) {
  sizes.push(20 + Math.round(Math.random() * 50));
}

const theStyle = `
  .scroller {
    height: 500px;
  }
`;

export const FlexWidth: FC = () => {
  const [rows, setRows] = useState<number[]>([]);

  useEffect(() => {
    setTimeout(() => {
      setRows(numbers);
    }, 1000);
  }, []);

  return (
    <>
      <style>{theStyle}</style>
      {rows.length === 0 && <div>LOADING...</div>}
      <Scroller className="scroller" rows={rows} rowHeight={50}>
        {(num: number, { row }) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{num}</span>
            <span style={{ fontSize: 'small', color: '#999' }}>{sizes[row]}px</span>
          </div>
        )}
      </Scroller>
    </>
  );
};
