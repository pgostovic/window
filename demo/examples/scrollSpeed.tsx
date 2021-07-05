import React, { FC, useState } from 'react';

import { GridScroller } from '../../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const ScrollSpeed: FC = () => {
  const [speed, setSpeed] = useState<number>(1);
  return (
    <>
      Scroll Speed:
      {[0.1, 1, 10].map(s => (
        <span key={s} style={{ marginLeft: '20px' }}>
          <input type="radio" name="speed" checked={speed === s} onChange={() => setSpeed(s)} />
          <span style={{ marginLeft: '5px' }}>{s}</span>
        </span>
      ))}
      <GridScroller style={{ height: '500px', width: '200px', marginTop: '10px' }} rows={numbers} scrollSpeed={speed}>
        {(num: number) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>{num}</div>
        )}
      </GridScroller>
    </>
  );
};
