import React, { FC } from 'react';
import styled from 'styled-components';

import Window from '../src';

const StyledWindow = styled(Window)`
  height: 500px;
  width: 200px;
`;

const Row = styled.div`
  display: flex;
  border-bottom: 1px solid #ccc;
  align-items: center;
`;

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const WithStyledComponents: FC = () => (
  <StyledWindow items={numbers}>{(num: number) => <Row>{num}</Row>}</StyledWindow>
);
