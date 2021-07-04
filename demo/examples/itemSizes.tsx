import React, { FC, useEffect, useRef, useState } from 'react';

import { Scroller, ScrollerRef } from '../../src';

const NUM = 1000;

const numbers: number[] = [];
for (let i = 0; i < NUM; i++) {
  numbers.push(i);
}

const sizes: (number | 'natural')[] = [];
for (let i = 0; i < NUM; i++) {
  if (i === 0 || i === 50) {
    sizes.push('natural');
  } else {
    sizes.push(20 + Math.round(Math.random() * 50));
  }
}

let offset = { left: 0, top: 0 };

export const ItemSizes: FC = () => {
  const windowRef = useRef<ScrollerRef>();
  const [slice, setSlice] = useState(NUM);

  const slicedNums = numbers.slice(0, slice);
  const slicedSizes = sizes.slice(0, slice);

  useEffect(() => {
    const winApi = windowRef.current;
    return () => {
      offset = winApi.getScrollPosition();
    };
  });
  return (
    <>
      <button onClick={() => setSlice(5)}>Slice 5</button>
      <button onClick={() => setSlice(25)}>Slice 25</button>
      <button onClick={() => setSlice(1000)}>Slice 1000</button>
      <Scroller
        ref={windowRef}
        style={{ height: '500px', width: '200px' }}
        rows={slicedNums}
        rowHeight={index => slicedSizes[index]}
        initScrollPosition={offset}
      >
        {(num: number, { row }) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', height: '100%' }}>
            <span style={{ flex: 1 }}>{num}</span>
            <span style={{ fontSize: 'small', color: '#999' }}>{slicedSizes[row]}px</span>
          </div>
        )}
      </Scroller>
    </>
  );
};
