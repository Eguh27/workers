import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTransientInstagramError, isPublishQuotaError } from './transient-error';

/* Error asli dari Instagram. Yang transient harus dikembalikan ke antrean tanpa
   membakar attempt; yang permanen harus dihitung sebagai kegagalan nyata. */

const transient = (msg: string) =>
  assert.equal(isTransientInstagramError(msg), true, `seharusnya transient: ${msg}`);

const permanent = (msg: string) =>
  assert.equal(isTransientInstagramError(msg), false, `seharusnya permanen: ${msg}`);

test('kuota publish IG habis (2207042) bersifat transient', () => {
  transient(
    '{"message":"User is performing too many actions","type":"OAuthException","is_transient":false,"code":9,"error_subcode":2207042,"error_user_title":"Media Publish Limit Exceeded","error_user_msg":"You reached maximum number of posts that is allowed to be published by Content Publishing API.","fbtrace_id":"AJafGII_KovNpbe21IgrH3m"}',
  );
});

test('throttle dan kegagalan unduh media tetap transient', () => {
  transient('{"message":"Application request limit reached","type":"OAuthException","code":4}');
  transient('{"message":"Media download has failed.","type":"OAuthException","code":9004}');
  transient('{"message":"The media could not be fetched from this URI: https://example.com/a.jpg","type":"OAuthException","error_subcode":2207052}');
});

test('token kedaluwarsa bukan transient', () => {
  permanent(
    '{"message":"Error validating access token: Session has expired on Saturday, 14-Nov-26 20:42:13 PST.","type":"OAuthException","code":190}',
  );
  permanent(
    '{"message":"Error validating access token: The session has been invalidated because the user changed their password.","type":"OAuthException","code":190,"error_subcode":0}',
  );
});

test('media tidak ditemukan bukan transient', () => {
  permanent('{"message":"The requested resource does not exist","type":"OAuthException","code":24}');
});

/* Kuota publish habis adalah transient, TAPI harus dibedakan: ia memblokir
   seluruh akun sampai jendela 24 jam bergulir, jadi run harus berhenti — bukan
   mencoba job berikutnya dengan harapan berbeda. */

const quota = (msg: string) =>
  assert.equal(isPublishQuotaError(msg), true, `seharusnya kuota habis: ${msg}`);

const notQuota = (msg: string) =>
  assert.equal(isPublishQuotaError(msg), false, `seharusnya bukan kuota: ${msg}`);

test('kuota publish habis dikenali dari subcode 2207042', () => {
  quota(
    '{"message":"User is performing too many actions","type":"OAuthException","is_transient":false,"code":9,"error_subcode":2207042,"error_user_title":"Media Publish Limit Exceeded","error_user_msg":"You reached maximum number of posts that is allowed to be published by Content Publishing API.","fbtrace_id":"AR-CviUr2FECy3FfO_cR4_u"}',
  );
});

test('kuota publish habis dikenali walau subcode tidak ikut terkirim', () => {
  quota('{"message":"You reached maximum number of posts that is allowed to be published by Content Publishing API.","type":"OAuthException","code":9}');
  quota('{"message":"Media Publish Limit Exceeded","code":9}');
});

test('transient lain bukan kuota habis', () => {
  notQuota('{"message":"Media download has failed.","type":"OAuthException","code":9004}');
  notQuota('{"message":"Application request limit reached","type":"OAuthException","code":4}');
  notQuota('{"message":"Error validating access token: Session has expired.","type":"OAuthException","code":190}');
  notQuota('{"message":"The requested resource does not exist","type":"OAuthException","code":24}');
});
