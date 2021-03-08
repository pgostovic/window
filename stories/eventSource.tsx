import React, { createRef, FC } from 'react';

import { Scroller } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const EventSource: FC = () => (
  <>
    Scroll with the cursor anywhere in the frame.
    <Scroller eventSource={window} style={{ height: '500px', width: '200px' }} rows={numbers}>
      {(num: number) => (
        <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
          {num}
        </div>
      )}
    </Scroller>
  </>
);

export const EventSourceRef: FC = () => {
  const rootRef = createRef<HTMLDivElement>();
  return (
    <div ref={rootRef} style={{ height: '700px', width: '400px', backgroundColor: '#eee' }}>
      Scroll with the cursor anywhere in the shaded region.
      <Scroller eventSourceRef={rootRef} style={{ height: '500px', width: '200px' }} rows={numbers}>
        {(num: number) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
            {num}
          </div>
        )}
      </Scroller>
    </div>
  );
};
