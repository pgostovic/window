import React, { FC, useState } from 'react';

import { Scroller } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const ScrollSpeed: FC = () => {
  const [speed, setSpeed] = useState<number>(1);
  const [freezeScroll, setFreezeScroll] = useState(false);
  return (
    <>
      Scroll Speed:
      {[0.1, 1, 10].map(s => (
        <span key={s} style={{ marginLeft: '20px' }}>
          <input type="radio" name="speed" checked={speed === s} onChange={() => setSpeed(s)} />
          <span style={{ marginLeft: '5px' }}>{s}</span>
        </span>
      ))}
      <input
        type="checkbox"
        style={{ marginLeft: '50px', marginRight: '10px' }}
        onChange={event => setFreezeScroll(event.target.checked)}
      />
      Freeze Scrolling
      <Scroller
        style={{ height: '500px', width: '200px', marginTop: '10px' }}
        rows={numbers}
        scrollSpeed={speed}
        freezeScroll={freezeScroll}
      >
        {(num: number) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>{num}</div>
        )}
      </Scroller>
    </>
  );
};
