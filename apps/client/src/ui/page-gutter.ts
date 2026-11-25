import { createContext } from 'react';

/**
 * The left and right padding of the page around its content, so a row that
 * scrolls sideways can run out to the screen's edges and still start on the
 * page's text line. 0 where the page has no such padding.
 */
export const PageGutter = createContext(0);
