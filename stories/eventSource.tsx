import React, { createRef, FC } from 'react';

import Window from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const EventSource: FC = () => {
  const rootRef = createRef<HTMLDivElement>();

  return (
    <div ref={rootRef} style={{ height: '95vh', backgroundColor: '#eee' }}>
      <Window eventSourceRef={rootRef} style={{ height: '500px', width: '200px' }} items={numbers}>
        {(num: number) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
            {num}
          </div>
        )}
      </Window>
    </div>
  );
};
