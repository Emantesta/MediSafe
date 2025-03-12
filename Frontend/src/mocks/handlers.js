import { rest } from 'msw';
import healthMock from '../__mocks__/health.json';

export const handlers = [
  rest.get('/health', (req, res, ctx) => {
    return res(ctx.json(healthMock));
  }),
];
