const { test, expect } = require('@playwright/test');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const functionsDir = path.join(root, 'netlify', 'functions');

function parseJson(response) {
  return JSON.parse(response.body || '{}');
}

function event(method, body, headers = {}) {
  return {
    httpMethod: method,
    headers,
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

function createFirebaseMock(options = {}) {
  const writes = [];
  const authCalls = [];
  let docIndex = 0;
  const usersByEmail = new Map(Object.entries(options.usersByEmail || {}));
  const snapshots = options.snapshots || {};
  const verifiedUser = options.verifiedUser || {
    decodedToken: {
      uid: 'qa-user',
      email: 'qa-user@example.test',
      name: 'QA User',
      email_verified: true,
    },
    roles: options.roles || ['intern'],
  };

  function snapshotFor(ref) {
    const collectionSnapshots = snapshots[ref.collectionName] || {};
    const data = collectionSnapshots[ref.id];
    return {
      exists: data !== undefined,
      data: () => data || {},
    };
  }

  function makeRef(collectionName, id) {
    const ref = {
      collectionName,
      id: id || `${collectionName}-${++docIndex}`,
      async set(data, mergeOptions) {
        writes.push({ mode: 'set', collectionName, id: ref.id, data, mergeOptions });
      },
      async get() {
        return snapshotFor(ref);
      },
    };
    return ref;
  }

  const database = {
    writes,
    collection(collectionName) {
      return {
        doc(id) {
          return makeRef(collectionName, id);
        },
        async add(data) {
          const ref = makeRef(collectionName);
          writes.push({ mode: 'add', collectionName, id: ref.id, data });
          return ref;
        },
      };
    },
    async runTransaction(callback) {
      const tx = {
        async get(ref) {
          return snapshotFor(ref);
        },
        set(ref, data, mergeOptions) {
          writes.push({ mode: 'tx.set', collectionName: ref.collectionName, id: ref.id, data, mergeOptions });
        },
      };
      return callback(tx);
    },
  };

  const authApi = {
    async verifyIdToken(token) {
      authCalls.push({ method: 'verifyIdToken', token });
      if (options.verifyError) throw options.verifyError;
      return verifiedUser.decodedToken;
    },
    async getUserByEmail(email) {
      authCalls.push({ method: 'getUserByEmail', email });
      const user = usersByEmail.get(String(email).toLowerCase());
      if (!user) {
        const error = new Error('No user');
        error.code = 'auth/user-not-found';
        throw error;
      }
      return user;
    },
    async setCustomUserClaims(uid, claims) {
      authCalls.push({ method: 'setCustomUserClaims', uid, claims });
    },
    async updateUser(uid, patch) {
      authCalls.push({ method: 'updateUser', uid, patch });
    },
    async revokeRefreshTokens(uid) {
      authCalls.push({ method: 'revokeRefreshTokens', uid });
    },
  };

  const firebaseAdmin = {
    OWNER_EMAIL: 'richkingsford@gmail.com',
    OWNER_ROLES: ['admin', 'board-member', 'mentor', 'intern'],
    VALID_ROLES: ['admin', 'board-member', 'mentor', 'intern'],
    FieldValue: {
      serverTimestamp: () => ({ __serverTimestamp: true }),
      increment: (value) => ({ __increment: value }),
    },
    auth: () => authApi,
    db: () => database,
    json: (statusCode, body) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(body),
    }),
    normalizeEmail: (email) => String(email || '').trim().toLowerCase(),
    registeredRolesFrom(values) {
      return [...new Set((values || []).map((role) => String(role || '').trim().toLowerCase()).filter((role) => firebaseAdmin.VALID_ROLES.includes(role)))];
    },
    rolesFromClaims(decodedToken = {}) {
      if (decodedToken.suspended === true) return [];
      return firebaseAdmin.registeredRolesFrom([
        ...(Array.isArray(decodedToken.roles) ? decodedToken.roles : []),
        ...(Array.isArray(decodedToken.skilfRoles) ? decodedToken.skilfRoles : []),
        decodedToken.admin === true ? 'admin' : '',
        decodedToken.boardMember === true ? 'board-member' : '',
        decodedToken.mentor === true ? 'mentor' : '',
        decodedToken.intern === true ? 'intern' : '',
      ]);
    },
    hasRole: (roles, role) => roles.includes(role),
    isOwner: (decodedToken) => String(decodedToken.email || '').toLowerCase() === 'richkingsford@gmail.com' && decodedToken.email_verified === true,
    isAdmin(decodedToken, roles = firebaseAdmin.rolesFromClaims(decodedToken)) {
      return firebaseAdmin.isOwner(decodedToken) || roles.includes('admin');
    },
    writesAllowed: () => String(process.env.SKILF_ALLOW_WRITES || 'true').toLowerCase() !== 'false',
    blockWritesIfDisabled() {
      if (firebaseAdmin.writesAllowed()) return;
      const error = new Error('Production writes are disabled for this deployment.');
      error.statusCode = 403;
      throw error;
    },
    async requireUser(incomingEvent) {
      if (options.requireUserError) throw options.requireUserError;
      const value = (incomingEvent.headers || {}).authorization || (incomingEvent.headers || {}).Authorization || '';
      if (!/^Bearer\s+/.test(value)) {
        const error = new Error('Sign in before continuing.');
        error.statusCode = 401;
        throw error;
      }
      return verifiedUser;
    },
    _database: database,
    _authCalls: authCalls,
  };

  return firebaseAdmin;
}

function createStripeMock(options = {}) {
  const calls = {
    secrets: [],
    sessions: [],
    constructEvents: [],
  };
  function Stripe(secret) {
    calls.secrets.push(secret);
    return {
      checkout: {
        sessions: {
          create: async (payload) => {
            calls.sessions.push(payload);
            if (options.sessionError) throw options.sessionError;
            return options.session || { id: 'cs_test_qa', url: 'https://checkout.example.test/session' };
          },
        },
      },
      webhooks: {
        constructEvent: (body, signature, secret) => {
          calls.constructEvents.push({ body: String(body), signature, secret });
          if (options.webhookError) throw options.webhookError;
          return options.webhookEvent || {
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_completed_qa',
                payment_intent: 'pi_qa',
                metadata: {
                  paymentId: 'payment-qa',
                  kind: 'check-in',
                  authUid: 'intern-qa',
                  authEmail: 'intern@example.test',
                },
              },
            },
          };
        },
      },
    };
  }
  Stripe._calls = calls;
  return Stripe;
}

function loadHandler(functionName, { firebaseMock = createFirebaseMock(), stripeMock = null } = {}) {
  const filename = path.join(functionsDir, `${functionName}.js`);
  delete require.cache[require.resolve(filename)];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './_firebase-admin' && parent && parent.filename && parent.filename.startsWith(functionsDir)) {
      return firebaseMock;
    }
    if (request === 'stripe' && stripeMock) return stripeMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return {
      handler: require(filename).handler,
      firebaseMock,
      stripeMock,
    };
  } finally {
    Module._load = originalLoad;
  }
}

async function withEnv(values, callback) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return await callback();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test.describe('Netlify function unit coverage', () => {
  test('send-message rejects unauthenticated and unregistered users, then sends registered mail', async () => {
    await withEnv({
      RESEND_API_KEY: 're_qa',
      MESSAGE_TO_EMAIL: 'richkingsford@gmail.com',
      MESSAGE_FROM_EMAIL: 'Skilf <sender@example.test>',
      SKILF_ALLOW_WRITES: 'true',
    }, async () => {
      const missingAuth = loadHandler('send-message');
      let response = await missingAuth.handler(event('POST', { message: 'Hello' }));
      expect(response.statusCode).toBe(401);

      const unregistered = loadHandler('send-message', {
        firebaseMock: createFirebaseMock({ roles: [] }),
      });
      response = await unregistered.handler(event('POST', { message: 'Hello' }, { authorization: 'Bearer token' }));
      expect(response.statusCode).toBe(403);

      const sent = [];
      const originalFetch = global.fetch;
      global.fetch = async (url, init) => {
        sent.push({ url, init });
        return {
          ok: true,
          json: async () => ({ id: 'email-qa' }),
        };
      };
      try {
        const registered = loadHandler('send-message', {
          firebaseMock: createFirebaseMock({
            roles: ['mentor'],
            verifiedUser: {
              decodedToken: {
                uid: 'mentor-qa',
                email: 'mentor@example.test',
                name: 'Mentor QA',
              },
              roles: ['mentor'],
            },
          }),
        });
        response = await registered.handler(event('POST', {
          targetName: 'Evidence project',
          targetType: 'intern',
          targetField: 'AI',
          targetProject: 'Use tools honestly',
          message: 'I can help with the project.',
          messageId: 'msg-qa',
        }, { authorization: 'Bearer token' }));
      } finally {
        global.fetch = originalFetch;
      }

      expect(response.statusCode).toBe(200);
      expect(parseJson(response)).toEqual({ ok: true, id: 'email-qa' });
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe('https://api.resend.com/emails');
      const resendBody = JSON.parse(sent[0].init.body);
      expect(resendBody.subject).toBe('Skilf message for Evidence project');
      expect(resendBody.reply_to).toBe('mentor@example.test');
      expect(sent[0].init.headers['Idempotency-Key']).toBe('skilf-msg-qa');
    });
  });

  test('record-dashboard-action enforces roles and records board decisions', async () => {
    const internOnly = loadHandler('record-dashboard-action', {
      firebaseMock: createFirebaseMock({
        verifiedUser: {
          decodedToken: { uid: 'intern-qa', email: 'intern@example.test' },
          roles: ['intern'],
        },
      }),
    });
    let response = await internOnly.handler(event('POST', { action: 'pass-demo' }, { authorization: 'Bearer token' }));
    expect(response.statusCode).toBe(403);

    const boardMock = createFirebaseMock({
      verifiedUser: {
        decodedToken: { uid: 'board-qa', email: 'board@example.test' },
        roles: ['board-member'],
      },
    });
    const board = loadHandler('record-dashboard-action', { firebaseMock: boardMock });
    response = await board.handler(event('POST', {
      action: 'pass-demo',
      internId: 'INT-QA',
      internName: 'Dummy Intern',
      sourcePage: 'board-member-dashboard.html',
    }, { authorization: 'Bearer token' }));

    expect(response.statusCode).toBe(200);
    expect(parseJson(response).ok).toBe(true);
    const actionWrite = boardMock._database.writes.find((write) => write.collectionName === 'dashboardActions');
    expect(actionWrite.data.action).toBe('pass-demo');
    expect(actionWrite.data.actorRoles).toEqual(['board-member']);
  });

  test('record-dashboard-action spends mentor credits transactionally', async () => {
    const mentorMock = createFirebaseMock({
      verifiedUser: {
        decodedToken: { uid: 'mentor-qa', email: 'mentor@example.test' },
        roles: ['mentor'],
      },
      snapshots: {
        creditAccounts: {
          'mentor-qa': {
            mentorDonationCredits: 2,
            internGiveawayCredits: 0,
            checkInCredits: 0,
            monthKey: new Date().toISOString().slice(0, 7),
            createdAt: true,
          },
        },
      },
    });
    const loaded = loadHandler('record-dashboard-action', { firebaseMock: mentorMock });
    const response = await loaded.handler(event('POST', {
      action: 'donate-credit',
      internId: 'INT-QA',
      internName: 'Dummy Intern',
    }, { authorization: 'Bearer token' }));

    expect(response.statusCode).toBe(200);
    expect(parseJson(response).balances.mentorDonationCredits).toBe(1);
    const ledgerWrite = mentorMock._database.writes.find((write) => write.collectionName === 'creditLedger');
    expect(ledgerWrite.data.creditKind).toBe('mentor-monthly-check-in');
    expect(ledgerWrite.data.creditDelta).toBe(-1);
  });

  test('admin-set-user-roles supports lookup, suspension, and owner protection', async () => {
    await withEnv({ ADMIN_ROLE_TOKEN: 'qa-admin-token', SKILF_ALLOW_WRITES: 'true' }, async () => {
      const targetUser = {
        uid: 'target-qa',
        email: 'target@example.test',
        displayName: 'Target QA',
        disabled: false,
        customClaims: { roles: ['intern'], skilfRoles: ['intern'] },
      };
      const adminMock = createFirebaseMock({
        usersByEmail: {
          'target@example.test': targetUser,
          'richkingsford@gmail.com': {
            uid: 'owner',
            email: 'richkingsford@gmail.com',
            displayName: 'Rich',
            disabled: false,
            customClaims: {},
          },
        },
      });
      const loaded = loadHandler('admin-set-user-roles', { firebaseMock: adminMock });

      let response = await loaded.handler(event('POST', {
        email: 'target@example.test',
        lookupOnly: true,
      }, { 'x-skilf-admin-token': 'qa-admin-token' }));
      expect(response.statusCode).toBe(200);
      expect(parseJson(response).user.roles).toEqual(['intern']);

      response = await loaded.handler(event('POST', {
        email: 'target@example.test',
        roles: ['mentor'],
        suspended: true,
        reason: 'QA spam test',
      }, { 'x-skilf-admin-token': 'qa-admin-token' }));
      expect(response.statusCode).toBe(200);
      expect(parseJson(response).user.suspended).toBe(true);
      expect(adminMock._authCalls.some((call) => call.method === 'updateUser' && call.patch.disabled === true)).toBe(true);
      expect(adminMock._database.writes.some((write) => write.collectionName === 'roleAudit' && write.data.action === 'suspend-account')).toBe(true);

      response = await loaded.handler(event('POST', {
        email: 'richkingsford@gmail.com',
        roles: ['admin'],
        suspended: true,
        reason: 'Should not happen',
      }, { 'x-skilf-admin-token': 'qa-admin-token' }));
      expect(response.statusCode).toBe(400);
      expect(parseJson(response).error).toContain('owner admin account');
    });
  });

  test('create-checkout-session validates auth and builds sponsor checkout', async () => {
    await withEnv({
      STRIPE_SECRET_KEY: 'sk_test_qa',
      SKILF_ALLOW_WRITES: 'true',
    }, async () => {
      const stripeMock = createStripeMock();
      const loaded = loadHandler('create-checkout-session', {
        firebaseMock: createFirebaseMock(),
        stripeMock,
      });

      let response = await loaded.handler(event('POST', { kind: 'check-in' }, { origin: 'http://localhost:3999' }));
      expect(response.statusCode).toBe(401);

      response = await loaded.handler(event('POST', { kind: 'sponsor-credit', internId: 'INT-QA' }, { origin: 'http://localhost:3999' }));
      expect(response.statusCode).toBe(200);
      const data = parseJson(response);
      expect(data.url).toBe('https://checkout.example.test/session');
      expect(stripeMock._calls.sessions[0].line_items[0].price_data.unit_amount).toBe(10000);
      expect(loaded.firebaseMock._database.writes.some((write) => write.collectionName === 'payments' && write.data.status === 'checkout_opened')).toBe(true);
    });
  });

  test('create-checkout-session records Stripe failures', async () => {
    await withEnv({
      STRIPE_SECRET_KEY: 'sk_test_qa',
      SKILF_ALLOW_WRITES: 'true',
    }, async () => {
      const stripeMock = createStripeMock({ sessionError: new Error('Stripe is down') });
      const loaded = loadHandler('create-checkout-session', {
        firebaseMock: createFirebaseMock(),
        stripeMock,
      });
      const response = await loaded.handler(event('POST', { kind: 'sponsor-credit' }, { origin: 'http://localhost:3999' }));
      expect(response.statusCode).toBe(502);
      expect(loaded.firebaseMock._database.writes.some((write) => write.collectionName === 'payments' && write.data.status === 'checkout_failed')).toBe(true);
    });
  });

  test('stripe-webhook rejects bad config/signatures and reconciles completed checkouts', async () => {
    await withEnv({
      STRIPE_SECRET_KEY: 'sk_test_qa',
      STRIPE_WEBHOOK_SECRET: undefined,
      SKILF_ALLOW_WRITES: 'true',
    }, async () => {
      const missingSecret = loadHandler('stripe-webhook', {
        firebaseMock: createFirebaseMock(),
        stripeMock: createStripeMock(),
      });
      const response = await missingSecret.handler(event('POST', {}, { 'stripe-signature': 'sig' }));
      expect(response.statusCode).toBe(500);
    });

    await withEnv({
      STRIPE_SECRET_KEY: 'sk_test_qa',
      STRIPE_WEBHOOK_SECRET: 'whsec_qa',
      SKILF_ALLOW_WRITES: 'true',
    }, async () => {
      const invalid = loadHandler('stripe-webhook', {
        firebaseMock: createFirebaseMock(),
        stripeMock: createStripeMock({ webhookError: new Error('bad signature') }),
      });
      let response = await invalid.handler(event('POST', {}, { 'stripe-signature': 'sig' }));
      expect(response.statusCode).toBe(400);

      const firebaseMock = createFirebaseMock({
        snapshots: {
          payments: {
            'payment-qa': {
              authUid: 'intern-qa',
              authEmail: 'intern@example.test',
              kind: 'check-in',
            },
          },
        },
      });
      const reconciler = loadHandler('stripe-webhook', {
        firebaseMock,
        stripeMock: createStripeMock(),
      });
      response = await reconciler.handler({
        httpMethod: 'POST',
        headers: { 'stripe-signature': 'sig' },
        body: JSON.stringify({}),
        isBase64Encoded: false,
      });
      expect(response.statusCode).toBe(200);
      expect(parseJson(response).received).toBe(true);
      expect(firebaseMock._database.writes.some((write) => write.collectionName === 'payments' && write.data.status === 'paid')).toBe(true);
      expect(firebaseMock._database.writes.some((write) => write.collectionName === 'creditAccounts' && write.id === 'intern-qa')).toBe(true);
      expect(firebaseMock._database.writes.some((write) => write.collectionName === 'creditLedger' && write.data.creditKind === 'paid-check-in')).toBe(true);
    });
  });
});
