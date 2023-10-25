'use strict';

const _ = require('lodash');
const db = require('../database');
const topics = require('.');
const categories = require('../categories');
const user = require('../user');
const plugins = require('../plugins');
const privileges = require('../privileges');
const utils = require('../utils');
module.exports = function (Topics) {
  const topicTools = {};
  Topics.tools = topicTools;

  /**
   * Deletes a topic.
   *
   * @async
   * @param {string|number} tid - The ID of the topic to restore.
   * @param {number} uid - The ID of the user performing the restore action.
   *
   * @returns {Object} - The result object with properties:
   *   - {string|number} tid - The ID of the restored topic.
   *   - {number} cid - The ID of the category where the topic is located.
   *   - {boolean} isDelete - The deletion state of the topic (should be false after restoration).
   *   - {number} uid - The ID of the user performing the action.
   *   - {Object} user - User data with properties:
   *     - {string} username - The username of the user.
   *     - {string} userslug - The slug of the user's name.
   */
  topicTools.delete = async function (tid, uid) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const result = await toggleDelete(tid, uid, true);
    if (typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.cid !== 'number' || typeof result.uid !== 'number' || typeof result.isDelete !== 'boolean' || typeof result.user !== 'object' || result.user && (typeof result.user.username !== 'string' || typeof result.user.userslug !== 'string')) {
      throw new TypeError('Malformed result object.');
    }
    return result;
  };

  /**
   * Restores a deleted topic.
   *
   * @async
   * @param {string|number} tid - The ID of the topic to restore.
   * @param {number} uid - The ID of the user performing the restore action.
   *
   * @returns {Object} - The result object with properties:
   *   - {string|number} tid - The ID of the restored topic.
   *   - {number} cid - The ID of the category where the topic is located.
   *   - {boolean} isDelete - The deletion state of the topic (should be false after restoration).
   *   - {number} uid - The ID of the user performing the action.
   *   - {Object} user - User data with properties:
   *     - {string} username - The username of the user.
   *     - {string} userslug - The slug of the user's name.
   */
  topicTools.restore = async function (tid, uid) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const result = await toggleDelete(tid, uid, false);
    if (typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.cid !== 'number' || typeof result.uid !== 'number' || typeof result.isDelete !== 'boolean' || typeof result.user !== 'object' || result.user && (typeof result.user.username !== 'string' || typeof result.user.userslug !== 'string')) {
      throw new TypeError('Malformed result object.');
    }
    return result;
  };

  /**
   * Toggles the deletion state of a topic.
   *
   * @async
   * @param {string|number} tid - The ID of the topic.
   * @param {number} uid - The ID of the user performing the action.
   * @param {boolean} isDelete - Whether to delete (true) or restore (false) the topic.
   *
   * @returns {Object} - The result object with properties:
   *   - {string|number} tid - The ID of the topic.
   *   - {number} cid - The ID of the category where the topic is located.
   *   - {boolean} isDelete - The new deletion state of the topic.
   *   - {number} uid - The ID of the user performing the action.
   *   - {Object} user - User data with properties:
   *     - {string} username - The username of the user.
   *     - {string} userslug - The slug of the user's name.
   *   - {Array} events - Array of event objects related to the action.
   */
  async function toggleDelete(tid, uid, isDelete) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    if (typeof isDelete !== 'boolean') {
      throw new TypeError('Expected isDelete to be a boolean.');
    }
    const topicData = await Topics.getTopicData(tid);
    if (!topicData) {
      throw new Error('[[error:no-topic]]');
    }
    // Scheduled topics can only be purged
    if (topicData.scheduled) {
      throw new Error('[[error:invalid-data]]');
    }
    const canDelete = await privileges.topics.canDelete(tid, uid);
    const hook = isDelete ? 'delete' : 'restore';
    const data = await plugins.hooks.fire(`filter:topic.${hook}`, {
      topicData: topicData,
      uid: uid,
      isDelete: isDelete,
      canDelete: canDelete,
      canRestore: canDelete
    });
    if (!data.canDelete && data.isDelete || !data.canRestore && !data.isDelete) {
      throw new Error('[[error:no-privileges]]');
    }
    if (data.topicData.deleted && data.isDelete) {
      throw new Error('[[error:topic-already-deleted]]');
    } else if (!data.topicData.deleted && !data.isDelete) {
      throw new Error('[[error:topic-already-restored]]');
    }
    if (data.isDelete) {
      await Topics.delete(data.topicData.tid, data.uid);
    } else {
      await Topics.restore(data.topicData.tid);
    }
    const events = await Topics.events.log(tid, {
      type: isDelete ? 'delete' : 'restore',
      uid
    });
    data.topicData.deleted = data.isDelete ? 1 : 0;
    if (data.isDelete) {
      plugins.hooks.fire('action:topic.delete', {
        topic: data.topicData,
        uid: data.uid
      });
    } else {
      plugins.hooks.fire('action:topic.restore', {
        topic: data.topicData,
        uid: data.uid
      });
    }
    const userData = await user.getUserFields(data.uid, ['username', 'userslug']);
    const result = {
      tid: data.topicData.tid,
      cid: data.topicData.cid,
      isDelete: data.isDelete,
      uid: data.uid,
      user: userData,
      events
    };
    if (typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.cid !== 'number' || typeof result.uid !== 'number' || typeof result.isDelete !== 'boolean' || typeof result.user !== 'object' || result.user && (typeof result.user.username !== 'string' || typeof result.user.userslug !== 'string')) {
      throw new TypeError('Malformed result object.');
    }
    return result;
  }

  /**
   * Purges a topic.
   *
   * @param {string|number} tid - The ID of the topic to be purged.
   * @param {number} uid - The ID of the user performing the action.
   *
   * @returns {Object} - The result object with properties:
   *   - {string|number} tid - The ID of the purged topic.
   *   - {number} cid - The ID of the category where the topic was located.
   *   - {number} uid - The ID of the user performing the action.
   */
  topicTools.purge = async function (tid, uid) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const topicData = await Topics.getTopicData(tid);
    if (!topicData) {
      throw new Error('[[error:no-topic]]');
    }
    const canPurge = await privileges.topics.canPurge(tid, uid);
    if (!canPurge) {
      throw new Error('[[error:no-privileges]]');
    }
    await Topics.purgePostsAndTopic(tid, uid);
    const result = {
      tid: tid,
      cid: topicData.cid,
      uid: uid
    };
    if (typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.cid !== 'number' || typeof result.uid !== 'number') {
      throw new TypeError('Malformed result object');
    }
    return result;
  };

  /**
   * Locks a topic.
   *
   * @param {string|number} tid - The ID of the topic to be unlocked.
   * @param {number} uid - The ID of the user performing the action.
   *
   * @returns {Object} - The result object with properties:
   *   - {string|number} tid - The ID of the topic.
   *   - {number} uid - The ID of the topic owner.
   *   - {number} cid - The ID of the category.
   *   - {boolean} isLocked - If the topic is locked. To be deprecated in v2.0.
   *   - {boolean} locked - If the topic is locked.
   *   - {Array} events - The list of events associated with the topic.
   */
  topicTools.lock = async function (tid, uid) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const result = await toggleLock(tid, uid, true);
    if (typeof result !== 'object' || typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.uid !== 'number' || typeof result.cid !== 'number' || typeof result.isLocked !== 'boolean' ||
    // To be deprecated in v2.0
    typeof result.locked !== 'boolean' || !Array.isArray(result.events)) {
      throw new TypeError('Malformed result object.');
    }
    return result;
  };

  /**
   * Unlocks a topic.
   *
   * @param {string|number} tid - The ID of the topic to be unlocked.
   * @param {number} uid - The ID of the user performing the action.
   *
   * @returns {Object} - The result object with properties:
   *   - {string|number} tid - The ID of the topic.
   *   - {number} uid - The ID of the topic owner.
   *   - {number} cid - The ID of the category.
   *   - {boolean} isLocked - If the topic is locked. To be deprecated in v2.0.
   *   - {boolean} locked - If the topic is locked.
   *   - {Array} events - The list of events associated with the topic.
   */
  topicTools.unlock = async function (tid, uid) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const result = await toggleLock(tid, uid, false);
    if (typeof result !== 'object' || typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.uid !== 'number' || typeof result.cid !== 'number' || typeof result.isLocked !== 'boolean' ||
    // To be deprecated in v2.0
    typeof result.locked !== 'boolean' || !Array.isArray(result.events)) {
      throw new TypeError('Malformed result object.');
    }
    return result;
  };

  /**
   * Toggles the lock state of a topic.
   *
   * @param {string|number} tid - The ID of the topic to be locked or unlocked.
   * @param {number} uid - The ID of the user performing the action.
   * @param {boolean} lock - True to lock the topic, false to unlock.
   *
   * @returns {Object} - The topic data object with properties:
   *   - {string|number} tid - The ID of the topic.
   *   - {number} uid - The ID of the topic owner.
   *   - {number} cid - The ID of the category.
   *   - {boolean} isLocked - If the topic is locked. To be deprecated in v2.0.
   *   - {boolean} locked - If the topic is locked.
   *   - {Array} events - The list of events associated with the topic.
   */
  async function toggleLock(tid, uid, lock) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const topicData = await Topics.getTopicFields(tid, ['tid', 'uid', 'cid']);
    if (!topicData || !topicData.cid) {
      throw new Error('[[error:no-topic]]');
    }
    const isAdminOrMod = await privileges.categories.isAdminOrMod(topicData.cid, uid);
    if (!isAdminOrMod) {
      throw new Error('[[error:no-privileges]]');
    }
    await Topics.setTopicField(tid, 'locked', lock ? 1 : 0);
    topicData.events = await Topics.events.log(tid, {
      type: lock ? 'lock' : 'unlock',
      uid
    });
    topicData.isLocked = lock; // deprecate in v2.0
    topicData.locked = lock;
    plugins.hooks.fire('action:topic.lock', {
      topic: _.clone(topicData),
      uid: uid
    });
    if (typeof topicData !== 'object' || typeof topicData.tid !== 'string' && typeof topicData.tid !== 'number' || typeof topicData.uid !== 'number' || typeof topicData.cid !== 'number' || typeof topicData.isLocked !== 'boolean' ||
    // To be deprecated in v2.0
    typeof topicData.locked !== 'boolean' || !Array.isArray(topicData.events)) {
      throw new TypeError('Malformed topicData object.');
    }
    return topicData;
  }

  /**
   * Pins a topic.
   *
   * @param {string|number} tid - The ID of the topic to be unpinned.
   * @param {number} uid - The ID of the user performing the unpin action.
   *
   * @returns {Object} - The topic data object with properties:
   *   - {string|number} tid - The ID of the topic.
   *   - {number} uid - The ID of the topic owner.
   *   - {number} cid - The ID of the category.
   *   - {boolean} isPinned - If the topic is pinned. To be deprecated in v2.0.
   *   - {boolean} pinned - If the topic is pinned.
   *   - {Array} events - The list of events associated with the topic.
   */
  topicTools.pin = async function (tid, uid) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a strin or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const result = await togglePin(tid, uid, true);
    if (typeof result !== 'object' || typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.uid !== 'number' || typeof result.cid !== 'number' || typeof result.isPinned !== 'boolean' ||
    // To be deprecated in v2.0
    typeof result.pinned !== 'boolean' || !Array.isArray(result.events)) {
      throw new TypeError('Malformed topicData object.');
    }
    return result;
  };

  /**
   * Unpins a topic.
   *
   * @param {string|number} tid - The ID of the topic to be unpinned.
   * @param {number} uid - The ID of the user performing the unpin action.
   *
   * @returns {Object} - The topic data object with properties:
   *   - {string|number} tid - The ID of the topic.
   *   - {number} uid - The ID of the topic owner.
   *   - {number} cid - The ID of the category.
   *   - {boolean} isPinned - If the topic is pinned. To be deprecated in v2.0.
   *   - {boolean} pinned - If the topic is pinned.
   *   - {Array} events - The list of events associated with the topic.
   */
  topicTools.unpin = async function (tid, uid) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    const result = await togglePin(tid, uid, false);
    if (typeof result !== 'object' || typeof result.tid !== 'string' && typeof result.tid !== 'number' || typeof result.uid !== 'number' || typeof result.cid !== 'number' || typeof result.isPinned !== 'boolean' ||
    // To be deprecated in v2.0
    typeof result.pinned !== 'boolean' || !Array.isArray(result.events)) {
      throw new TypeError('Malformed topicData object.');
    }
    return result;
  };

  /**
   * Sets the expiry time for a pinned topic.
   *
   * @param {string|number} tid - The ID of the topic.
   * @param {number} expiry - The timestamp when the topic pinning should expire.
   * @param {number} uid - The ID of the user performing the action.
   *
   * @returns {void}
   */
  topicTools.setPinExpiry = async (tid, expiry, uid) => {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    if (isNaN(parseInt(expiry, 10)) || expiry <= Date.now()) {
      throw new Error('[[error:invalid-data]]');
    }
    const topicData = await Topics.getTopicFields(tid, ['tid', 'uid', 'cid']);
    const isAdminOrMod = await privileges.categories.isAdminOrMod(topicData.cid, uid);
    if (!isAdminOrMod) {
      throw new Error('[[error:no-privileges]]');
    }
    await Topics.setTopicField(tid, 'pinExpiry', expiry);
    plugins.hooks.fire('action:topic.setPinExpiry', {
      topic: _.clone(topicData),
      uid: uid
    });
  };

  /**
   * Checks if topics' pinned status should expire and unpins them if so.
   *
   * @param {Array<string|number>} tids - An array of topic IDs.
   *
   * @returns {Array<string|number>} - An array of topic IDs whose pinned status did not expire.
   */
  topicTools.checkPinExpiry = async tids => {
    if (!Array.isArray(tids)) {
      throw new TypeError('Expected tids to be an array of topic IDs.');
    }
    const expiry = (await topics.getTopicsFields(tids, ['pinExpiry'])).map(obj => obj.pinExpiry);
    const now = Date.now();
    tids = await Promise.all(tids.map(async (tid, idx) => {
      if (expiry[idx] && parseInt(expiry[idx], 10) <= now) {
        await togglePin(tid, 'system', false);
        return null;
      }
      return tid;
    }));
    const filteredTids = tids.filter(Boolean);
    if (!Array.isArray(filteredTids) || filteredTids.some(item => typeof item !== 'string' && typeof item !== 'number')) {
      throw new TypeError('Expected the result to be an array of topic IDs.');
    }
    return filteredTids;
  };

  /**
   * Toggles the pinned status of a topic.
   *
   * @async
   * @param {string|number} tid - The topic ID.
   * @param {number|string} uid - The user ID or 'system'.
   * @param {boolean} pin - Whether to pin (true) or unpin (false) the topic.
   *
   * @returns {object} - The updated topic data with the new pinned status.
   */
  async function togglePin(tid, uid, pin) {
    if (typeof tid !== 'string' && typeof tid !== 'number') {
      throw new TypeError('Expected tid to be a string or number.');
    }
    if (typeof uid !== 'number') {
      throw new TypeError('Expected uid to be a number.');
    }
    if (typeof pin !== 'boolean') {
      throw new TypeError('Expected pin to be a boolean.');
    }
    const topicData = await Topics.getTopicData(tid);
    if (!topicData) {
      throw new Error('[[error:no-topic]]');
    }
    if (topicData.scheduled) {
      throw new Error('[[error:cant-pin-scheduled]]');
    }
    if (uid !== 'system' && !(await privileges.topics.isAdminOrMod(tid, uid)) && !(await user.isInstructor(uid))) {
      throw new Error('[[error:no-privileges]]');
    }
    const promises = [Topics.setTopicField(tid, 'pinned', pin ? 1 : 0), Topics.events.log(tid, {
      type: pin ? 'pin' : 'unpin',
      uid
    })];
    if (pin) {
      promises.push(db.sortedSetAdd(`cid:${topicData.cid}:tids:pinned`, Date.now(), tid));
      promises.push(db.sortedSetsRemove([`cid:${topicData.cid}:tids`, `cid:${topicData.cid}:tids:posts`, `cid:${topicData.cid}:tids:votes`, `cid:${topicData.cid}:tids:views`], tid));
    } else {
      promises.push(db.sortedSetRemove(`cid:${topicData.cid}:tids:pinned`, tid));
      promises.push(Topics.deleteTopicField(tid, 'pinExpiry'));
      promises.push(db.sortedSetAddBulk([[`cid:${topicData.cid}:tids`, topicData.lastposttime, tid], [`cid:${topicData.cid}:tids:posts`, topicData.postcount, tid], [`cid:${topicData.cid}:tids:votes`, parseInt(topicData.votes, 10) || 0, tid], [`cid:${topicData.cid}:tids:views`, topicData.viewcount, tid]]));
      topicData.pinExpiry = undefined;
      topicData.pinExpiryISO = undefined;
    }
    const results = await Promise.all(promises);
    topicData.isPinned = pin; // deprecate in v2.0
    topicData.pinned = pin;
    topicData.events = results[1];
    plugins.hooks.fire('action:topic.pin', {
      topic: _.clone(topicData),
      uid
    });
    if (typeof topicData !== 'object' || typeof topicData.tid !== 'string' && typeof topicData.tid !== 'number' || typeof topicData.uid !== 'number' || typeof topicData.cid !== 'number' || typeof topicData.isPinned !== 'boolean' ||
    // To be deprecated in v2.0
    typeof topicData.pinned !== 'boolean' || !Array.isArray(topicData.events)) {
      throw new TypeError('Malformed topicData object.');
    }
    return topicData;
  }

  /**
   * Orders pinned topics for a given user and category.
   *
   * @param {number|string} uid - The user ID.
   * @param {object} data - The data object.
   * @param {number|string} data.tid - The topic ID.
   * @param {number} data.order - The order number for the topic.
   *
   * @returns {void} No return value.
   */
  topicTools.orderPinnedTopics = async function (uid, data) {
    if (typeof uid !== 'number' && typeof uid !== 'string') {
      throw new TypeError('Expected uid to be a number or string.');
    }
    if (typeof data !== 'object' || !data) {
      throw new TypeError('Expected data to be an object.');
    }
    if (typeof data.tid !== 'string' && typeof data.tid !== 'number') {
      throw new TypeError('Expected data.tid to be a number or string.');
    }
    if (typeof data.order !== 'number') {
      throw new TypeError('Expected data.order to be a number.');
    }
    const {
      tid,
      order
    } = data;
    const cid = await Topics.getTopicField(tid, 'cid');
    if (!cid || !tid || !utils.isNumber(order) || order < 0) {
      throw new Error('[[error:invalid-data]]');
    }
    const isAdminOrMod = await privileges.categories.isAdminOrMod(cid, uid);
    if (!isAdminOrMod) {
      throw new Error('[[error:no-privileges]]');
    }
    const pinnedTids = await db.getSortedSetRange(`cid:${cid}:tids:pinned`, 0, -1);
    const currentIndex = pinnedTids.indexOf(String(tid));
    if (currentIndex === -1) {
      return;
    }
    const newOrder = pinnedTids.length - order - 1;
    // moves tid to index order in the array
    if (pinnedTids.length > 1) {
      pinnedTids.splice(Math.max(0, newOrder), 0, pinnedTids.splice(currentIndex, 1)[0]);
    }
    await db.sortedSetAdd(`cid:${cid}:tids:pinned`, pinnedTids.map((tid, index) => index), pinnedTids);
  };

  /**
   * Moves a topic to a new category.
   *
   * @param {number|string} tid - The topic ID.
   * @param {object} data - The data object.
   * @param {number|string} data.cid - The category ID to move to.
   * @param {number|string} data.uid - The user ID performing the move.
   *
   * @returns {void} No return value.
   */
  topicTools.move = async function (tid, data) {
    if (typeof tid !== 'number' && typeof tid !== 'string') {
      throw new TypeError('Expected tid to be a number or string.');
    }
    if (typeof data !== 'object' || !data) {
      throw new TypeError('Expected data to be an object.');
    }
    if (typeof data.cid !== 'number' && typeof data.cid !== 'string') {
      throw new TypeError('Expected data.cid to be a number or string.');
    }
    if (typeof data.uid !== 'number' && typeof data.uid !== 'string') {
      throw new TypeError('Expected data.uid to be a number or string.');
    }
    const cid = parseInt(data.cid, 10);
    const topicData = await Topics.getTopicData(tid);
    if (!topicData) {
      throw new Error('[[error:no-topic]]');
    }
    if (cid === topicData.cid) {
      throw new Error('[[error:cant-move-topic-to-same-category]]');
    }
    const tags = await Topics.getTopicTags(tid);
    await db.sortedSetsRemove([`cid:${topicData.cid}:tids`, `cid:${topicData.cid}:tids:pinned`, `cid:${topicData.cid}:tids:posts`, `cid:${topicData.cid}:tids:votes`, `cid:${topicData.cid}:tids:views`, `cid:${topicData.cid}:tids:lastposttime`, `cid:${topicData.cid}:recent_tids`, `cid:${topicData.cid}:uid:${topicData.uid}:tids`, ...tags.map(tag => `cid:${topicData.cid}:tag:${tag}:topics`)], tid);
    topicData.postcount = topicData.postcount || 0;
    const votes = topicData.upvotes - topicData.downvotes;
    const bulk = [[`cid:${cid}:tids:lastposttime`, topicData.lastposttime, tid], [`cid:${cid}:uid:${topicData.uid}:tids`, topicData.timestamp, tid], ...tags.map(tag => [`cid:${cid}:tag:${tag}:topics`, topicData.timestamp, tid])];
    if (topicData.pinned) {
      bulk.push([`cid:${cid}:tids:pinned`, Date.now(), tid]);
    } else {
      bulk.push([`cid:${cid}:tids`, topicData.lastposttime, tid]);
      bulk.push([`cid:${cid}:tids:posts`, topicData.postcount, tid]);
      bulk.push([`cid:${cid}:tids:votes`, votes, tid]);
      bulk.push([`cid:${cid}:tids:views`, topicData.viewcount, tid]);
    }
    await db.sortedSetAddBulk(bulk);
    const oldCid = topicData.cid;
    await categories.moveRecentReplies(tid, oldCid, cid);
    await Promise.all([categories.incrementCategoryFieldBy(oldCid, 'topic_count', -1), categories.incrementCategoryFieldBy(cid, 'topic_count', 1), categories.updateRecentTidForCid(cid), categories.updateRecentTidForCid(oldCid), Topics.setTopicFields(tid, {
      cid: cid,
      oldCid: oldCid
    }), Topics.updateCategoryTagsCount([oldCid, cid], tags), Topics.events.log(tid, {
      type: 'move',
      uid: data.uid,
      fromCid: oldCid
    })]);
    const hookData = _.clone(data);
    hookData.fromCid = oldCid;
    hookData.toCid = cid;
    hookData.tid = tid;
    plugins.hooks.fire('action:topic.move', hookData);
  };
};