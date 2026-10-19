import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  getJwtSecret,
  generateToken,
  authenticateToken,
  JwtConfigError,
  JWT_SECRET_MISSING_MESSAGE,
} from './middleware/auth.js';

const ENV_KEYS = ['JWT_SECRET', 'VERCEL', 'NODE_ENV'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function runMiddleware(authorization) {
  const req = { headers: authorization ? { authorization } : {} };
  const res = fakeRes();
  let nextCalled = false;
  authenticateToken(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

describe('JWT_SECRET', () => {
  test('en producción sin JWT_SECRET no firma ni verifica', () => {
    process.env.VERCEL = '1';
    assert.throws(() => getJwtSecret(), JwtConfigError);
    assert.throws(() => generateToken({ id: '1', email: 'a@b.c' }), JwtConfigError);
    assert.match(JWT_SECRET_MISSING_MESSAGE, /^JWT_SECRET no está configurado en el servidor/);

    const { res, nextCalled } = runMiddleware('Bearer cualquier.cosa.aca');
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, JWT_SECRET_MISSING_MESSAGE);
  });

  test('en producción rechaza los valores de ejemplo del repo', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'cambiar_este_secreto_en_produccion';
    assert.throws(() => getJwtSecret(), JwtConfigError);
    process.env.JWT_SECRET = '   ';
    assert.throws(() => getJwtSecret(), JwtConfigError);
  });

  test('en producción con JWT_SECRET firma y verifica', () => {
    process.env.VERCEL = '1';
    process.env.JWT_SECRET = 'un-secreto-largo-y-aleatorio';
    const token = generateToken({ id: 'u1', email: 'ana@mail.com' });
    const { req, res, nextCalled } = runMiddleware(`Bearer ${token}`);
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(req.user.id, 'u1');
    assert.equal(req.user.email, 'ana@mail.com');
  });

  test('en desarrollo usa un secreto de prueba', () => {
    const token = generateToken({ id: 'u1', email: 'ana@mail.com' });
    assert.equal(runMiddleware(`Bearer ${token}`).nextCalled, true);
  });
});

describe('authenticateToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'secreto-de-test';
  });

  test('sin token → 401', () => {
    const { res, nextCalled } = runMiddleware(undefined);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test('token inválido → 401', () => {
    const { res, nextCalled } = runMiddleware('Bearer no-es-un-jwt');
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test('token firmado con otro secreto → 401', () => {
    const token = jwt.sign({ id: 'u1' }, 'otro-secreto');
    assert.equal(runMiddleware(`Bearer ${token}`).res.statusCode, 401);
  });

  test('token vencido → 401', () => {
    const token = jwt.sign({ id: 'u1', exp: Math.floor(Date.now() / 1000) - 60 }, 'secreto-de-test');
    assert.equal(runMiddleware(`Bearer ${token}`).res.statusCode, 401);
  });

  test('esquema distinto de Bearer → 401', () => {
    const token = generateToken({ id: 'u1', email: 'a@b.c' });
    assert.equal(runMiddleware(`Basic ${token}`).res.statusCode, 401);
  });

  test('token válido → next()', () => {
    const token = generateToken({ id: 'u1', email: 'a@b.c' });
    assert.equal(runMiddleware(`Bearer ${token}`).nextCalled, true);
  });
});
