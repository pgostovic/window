import React, { FC } from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Link, Route, Switch } from 'react-router-dom';
import styled from 'styled-components';

import * as basic from './examples/basic';
import * as basicgrid from './examples/basicgrid';
import * as eventSource from './examples/eventSource';
import * as flexWidth from './examples/flexWidth';
import * as itemSizes from './examples/itemSizes';
import * as richgrid from './examples/richgrid';
import * as scrollSpeed from './examples/scrollSpeed';
import * as scrollTo from './examples/scrollTo';
import * as sizeToFit from './examples/sizeToFit';

const examples = {
  basic,
  itemSizes,
  scrollTo,
  sizeToFit,
  flexWidth,
  eventSource,
  scrollSpeed,
  basicgrid,
  richgrid,
};

const flatExamples = Object.values(examples).reduce((rendered, comps) => ({ ...rendered, ...comps }), {});

const Nav = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 250px;
  height: 100vh;
  background-color: #f0f0f0;
  font-family: sans-serif;
  font-size: 14px;
`;

const NavGroupTitle = styled.div`
  background-color: #4e75be;
  padding: 5px;
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
`;
const NavGroup = styled.div`
  display: flex;
  flex-direction: column;
  padding: 5px 0 10px 0;
`;

const NavLink = styled(Link)`
  color: #555;
  text-decoration: none;
  padding: 3px 10px;

  &:hover {
    background-color: #ccc;
  }
`;

const Content = styled.div`
  padding-left: 250px;
`;

const Demo: FC = () => {
  return (
    <Router>
      <Nav>
        {Object.keys(examples).map(groupKey => (
          <>
            <NavGroupTitle>{groupKey}</NavGroupTitle>
            <NavGroup>
              {Object.keys(examples[groupKey]).map(k => (
                <NavLink key={k} to={k}>
                  {k}
                </NavLink>
              ))}
            </NavGroup>
          </>
        ))}
      </Nav>
      <Content>
        <Switch>
          {Object.keys(flatExamples).map(k => {
            const Example = flatExamples[k];
            return (
              <Route key={k} path={`/${k}`}>
                <Example />
              </Route>
            );
          })}
        </Switch>
      </Content>
    </Router>
  );
};

ReactDOM.render(<Demo />, document.getElementById('demo'));
