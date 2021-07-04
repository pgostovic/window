import React, { FC } from 'react';

import { Scroller } from '../../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const EventSource: FC = () => (
  <div>
    Scroll with the cursor anywhere in the frame.
    <Scroller
      scrollEventSource={document.documentElement}
      style={{
        height: '500px',
        width: '200px',
        border: '5px solid #eee',
      }}
      rows={numbers}
    >
      {(num: number) => (
        <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>{num}</div>
      )}
    </Scroller>
  </div>
);
