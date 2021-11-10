import React, { FC, useEffect, useRef, useState } from 'react';

import { GridScroller, ScrollerRef } from '../../src';

const NUM = 1000;

const numbers: number[] = [];
for (let i = 0; i < NUM; i++) {
  numbers.push(i);
}

const sizes: (number | 'natural')[] = [];
for (let i = 0; i < NUM; i++) {
  if (i === 0 || i === 50 || i === 55) {
    sizes.push('natural');
  } else {
    sizes.push(20 + Math.round(Math.random() * 50));
  }
}

let offset = { left: 0, top: 0 };

export const ItemSizes: FC = () => {
  const windowRef = useRef<ScrollerRef>();
  const [slice, setSlice] = useState(NUM);
  const [showMores, setShowMores] = useState<number[]>([]);

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
      <button type="button" onClick={() => setSlice(5)}>
        Slice 5
      </button>
      <button type="button" onClick={() => setSlice(25)}>
        Slice 25
      </button>
      <button type="button" onClick={() => setSlice(1000)}>
        Slice 1000
      </button>
      <GridScroller
        ref={windowRef}
        style={{ height: '500px', width: '200px' }}
        rows={slicedNums}
        rowHeight={index => slicedSizes[index]}
        initScrollPosition={offset}
      >
        {(num: number, { row }) =>
          row === 50 || row == 55 ? (
            <Resizeable
              showMore={showMores.includes(row)}
              onChange={showMore => {
                setShowMores(showMore ? showMores.concat([row]) : showMores.filter(r => r !== row));
              }}
            />
          ) : (
            <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', height: '100%' }}>
              <span style={{ flex: 1 }}>{num}</span>
              <span style={{ fontSize: 'small', color: '#999' }}>{slicedSizes[row]}px</span>
            </div>
          )
        }
      </GridScroller>
    </>
  );
};

const Resizeable: FC<{ showMore: boolean; onChange(showMore: boolean): void }> = ({ showMore, onChange }) => {
  return (
    <div style={{ borderBottom: '1px solid #ccc' }}>
      <div>
        RESIZEABLE
        <button type="button" onClick={() => onChange(!showMore)}>
          show/hide more
        </button>
      </div>
      {showMore && (
        <div>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas in blandit ante. Ut at malesuada ante.
          Aenean a dolor sed sem accumsan consectetur in vitae urna. Fusce eu augue sed mauris commodo accumsan. Nam
          lacus quam, hendrerit nec justo ut, sagittis consequat ante. In elementum, ex at varius pellentesque, quam
          mauris tincidunt ipsum, eu tristique leo velit eu libero. Nunc tincidunt dignissim iaculis. Duis at arcu
          tincidunt, tincidunt erat at, varius orci.
        </div>
      )}
    </div>
  );
};
