import React, { CSSProperties, FC, ReactElement, ReactNode } from 'react';
import styled from 'styled-components';

const Root = styled.div<{ topHeight: number; bottomHeight: number; leftWidth: number; rightWidth: number }>`
  display: grid;
  grid-template-columns: ${({ leftWidth }) => px(leftWidth)} 1fr ${({ rightWidth }) => px(rightWidth)};
  grid-template-rows: ${({ topHeight }) => px(topHeight)} 1fr ${({ bottomHeight }) => px(bottomHeight)};
  grid-template-areas:
    'fixedTop fixedTop fixedTop'
    'fixedLeft scroller fixedRight'
    'fixedBottom fixedBottom fixedBottom';
`;

const FixedTop = styled.div`
  grid-area: fixedTop;
`;

const FixedLeft = styled.div`
  grid-area: fixedLeft;
`;

const FixedRight = styled.div`
  grid-area: fixedRight;
`;

const FixedBottom = styled.div`
  grid-area: fixedBottom;
`;

export interface FixedMarginProps {
  top?: { height: number; node: ReactNode };
  bottom?: { height: number; node: ReactNode };
  left?: { width: number; node: ReactNode };
  right?: { width: number; node: ReactNode };
}

interface Props extends FixedMarginProps {
  className?: string;
  style?: CSSProperties;
  children: ReactElement;
}

const FixedMargin: FC<Props> = ({ top, bottom, left, right, className, style, children }) => {
  return (
    <Root
      style={style}
      className={className}
      topHeight={top?.height || 0}
      bottomHeight={bottom?.height || 0}
      leftWidth={left?.width || 0}
      rightWidth={right?.width || 0}
    >
      {children}
      <FixedTop>{top?.node}</FixedTop>
      <FixedBottom>{bottom?.node}</FixedBottom>
      <FixedLeft>{left?.node}</FixedLeft>
      <FixedRight>{right?.node}</FixedRight>
    </Root>
  );
};

const px = (size: number) => (size === 0 ? 0 : `${size}px`);

export default FixedMargin;
