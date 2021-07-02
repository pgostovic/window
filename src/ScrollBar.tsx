import React, { forwardRef, memo, Ref, useEffect, useImperativeHandle, useRef } from 'react';
import styled from 'styled-components';

import Scheduler from './Scheduler';

const MIN_BAR_SIZE_FRACTION = 0.05;

const Root = styled.div`
  box-sizing: border-box;
  opacity: 0;

  &.vertical {
    padding: 0 2px;
    width: 11px;
    transition: opacity 100ms linear, background-color 100ms linear, width 100ms linear;
  }

  &.horizontal {
    padding: 2px 0;
    height: 11px;
    transition: opacity 100ms linear, background-color 100ms linear, height 100ms linear;
  }

  &:hover {
    opacity: 1 !important;
    background-color: rgba(100, 100, 100, 0.05);

    &.vertical {
      width: 15px;
    }

    &.horizontal {
      height: 15px;
    }
  }
`;

const BarContainer = styled.div`
  height: 100%;
  width: 100%;
`;

const Bar = styled.div`
  background-color: rgba(100, 100, 100, 0.7);
  border-radius: 200px;
`;

interface Props {
  orientation: 'horizontal' | 'vertical';
  left?: string | 0;
  top?: string | 0;
  barSize: number;
  onScroll(position: number): void;
  className?: string;
}

export interface ScrollBarRef {
  setPosition(position: number): void;
}

const ScrollBar = memo(
  forwardRef<ScrollBarRef, Props>(
    ({ orientation, left, top, barSize, onScroll, className }, ref: Ref<ScrollBarRef>) => {
      const schedulerRef = useRef(new Scheduler());
      const rootElmntRef = useRef<HTMLDivElement>(null);
      const barContainerElmntRef = useRef<HTMLDivElement>(null);
      const rootSizeRef = useRef(0);
      const mouseDownLocRef = useRef<number>();
      const positionRef = useRef(0);
      const barSizeFraction = Math.max(MIN_BAR_SIZE_FRACTION, barSize);

      useImperativeHandle(ref, () => ({
        setPosition(position: number) {
          const nextPos = Math.max(0, Math.min(1, position));
          if (nextPos !== positionRef.current) {
            positionRef.current = nextPos;
            if (rootElmntRef.current && barContainerElmntRef.current) {
              const translate = orientation === 'vertical' ? 'translateY' : 'translateX';
              barContainerElmntRef.current.style.transform = `${translate}(${100 *
                (position * (1 - barSizeFraction))}%)`;
              rootElmntRef.current.style.opacity = '1';
              schedulerRef.current.debounce('hideScroller', 500, () => {
                if (rootElmntRef.current) {
                  rootElmntRef.current.style.opacity = '0';
                }
              });
            }
          } else {
            if (rootElmntRef.current) {
              rootElmntRef.current.style.opacity = '0';
            }
          }
        },
      }));

      useEffect(() => {
        schedulerRef.current.debounce('hideScroller', 500, () => {
          if (rootElmntRef.current) {
            rootElmntRef.current.style.opacity = '0';
          }
        });
      });

      if (barSizeFraction >= 1) {
        return null;
      }

      const barStyle =
        orientation === 'vertical'
          ? { height: `${100 * barSizeFraction}%` }
          : { width: `${100 * barSizeFraction}%`, height: '100%' };

      return (
        <Root
          ref={rootElmntRef}
          className={[className, orientation === 'vertical' ? 'vertical' : 'horizontal'].filter(Boolean).join(' ')}
          style={{ left, top }}
        >
          <BarContainer ref={barContainerElmntRef}>
            <Bar
              style={barStyle}
              onMouseDown={event => {
                event.preventDefault();
                mouseDownLocRef.current = orientation === 'vertical' ? event.clientY : event.clientX;
                if (rootElmntRef.current) {
                  const { width, height } = rootElmntRef.current.getBoundingClientRect();
                  rootSizeRef.current = orientation === 'vertical' ? height : width;
                }

                const startPosition = positionRef.current;

                const onMouseMove = (event: MouseEvent) => {
                  if (typeof mouseDownLocRef.current === 'number') {
                    const pos = orientation === 'vertical' ? event.clientY : event.clientX;
                    const dPos = pos - mouseDownLocRef.current;
                    const dPosFrac = dPos / (rootSizeRef.current * (1 - barSizeFraction));
                    onScroll(Math.max(0, Math.min(1, startPosition + dPosFrac)));
                  }
                };

                const onMouseUp = () => {
                  mouseDownLocRef.current = undefined;
                  window.removeEventListener('mousemove', onMouseMove);
                  window.removeEventListener('mouseup', onMouseUp);
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
              }}
            />
          </BarContainer>
        </Root>
      );
    },
  ),
);

export default ScrollBar;
