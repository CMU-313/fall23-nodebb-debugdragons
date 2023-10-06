'use strict';

const _ = require('lodash');

const groups = require('../groups');
const plugins = require('../plugins');
const db = require('../database');
const privileges = require('../privileges');
const categories = require('../categories');
const meta = require('../meta');
const utils = require('../utils');

const User = module.exports;

User.email = require('./email');
User.notifications = require('./notifications');
User.reset = require('./reset');
User.digest = require('./digest');
User.interstitials = require('./interstitials');

require('./data')(User);
require('./auth')(User);
require('./bans')(User);
require('./create')(User);
require('./posts')(User);
require('./topics')(User);
require('./categories')(User);
require('./follow')(User);
require('./profile')(User);
require('./admin')(User);
require('./delete')(User);
require('./settings')(User);
require('./search')(User);
require('./jobs')(User);
require('./picture')(User);
require('./approval')(User);
require('./invite')(User);
require('./password')(User);
require('./info')(User);
require('./online')(User);
require('./blocks')(User);
require('./uploads')(User);

/**
 * Checks if a user or users exist based on their user IDs.
 * @param {Array|string|number} uids
 * @returns {Promise<boolean|Array<boolean>>}
 */
User.exists = async function (uids) {
    if (!Array.isArray(uids) && typeof uids !== 'string' && typeof uids !== 'number') {
        throw new TypeError(`uids should be an array, string or number`);
    }

    const result = await (
        Array.isArray(uids) ?
            db.isSortedSetMembers('users:joindate', uids) :
            db.isSortedSetMember('users:joindate', uids)
    );

    if (Array.isArray(uids) && !Array.isArray(result)) {
        throw new TypeError(`Expected result to be an array of booleans`);
    } else if (!Array.isArray(uids) && typeof result !== 'boolean') {
        throw new TypeError(`Expected result to be a boolean`);
    }

    return result;
};

/**
 * Checks if a user exists by their slug
 * @param {string} userslug
 * @returns {Promise<boolean>}
 */
User.existsBySlug = async function (userslug) {
    if (typeof userslug !== 'string') {
        throw new TypeError(`Expected userslug to be a string`);
    }

    const exists = await User.getUidByUserslug(userslug);

    if (typeof !!exists !== 'boolean') {
        throw new TypeError(`Expected exists to be a boolean`);
    }

    return !!exists;
};

/**
 * Gets uids from a set
 * @param {string} set
 * @param {number} start
 * @param {number} stop
 * @returns {Promise<Array<number>>}
 */
User.getUidsFromSet = async function (set, start, stop) {
    if (typeof set !== 'string') {
        throw new TypeError(`Expected set to be a string`);
    }
    if (typeof start !== 'number') {
        throw new TypeError(`Expected start to be a number`);
    }
    if (typeof stop !== 'number') {
        throw new TypeError(`Expected stop to be a number`);
    }

    if (set === 'users:online') {
        const count = parseInt(stop, 10) === -1 ? stop : stop - start + 1;
        const now = Date.now();
        return await db.getSortedSetRevRangeByScore(set, start, count, '+inf', now - (meta.config.onlineCutoff * 60000));
    }

    const list = await db.getSortedSetRevRange(set, start, stop);

    if (!Array.isArray(list)) {
        throw new TypeError(`Expected list to be a list`);
    }

    return list;
};

/**
 * Gets users from a set
 * @param {string} set
 * @param {number} uid
 * @param {number} start
 * @param {number} stop
 * @returns {Promise<Array<number>>}
 */
User.getUsersFromSet = async function (set, uid, start, stop) {
    if (typeof set !== 'string') {
        throw new TypeError(`Expected set to be a string`);
    }
    if (typeof start !== 'number') {
        throw new TypeError(`Expected start to be a number`);
    }
    if (typeof stop !== 'number') {
        throw new TypeError(`Expected stop to be a number`);
    }

    const uids = await User.getUidsFromSet(set, start, stop);
    const list = await User.getUsers(uids, uid);

    if (!Array.isArray(list)) {
        throw new TypeError(`Expected list to be a list`);
    }

    return list;
};

/**
 * Retrieves user data with specific fields.
 * @param {Array|string|number} uids
 * @param {Array<string>} fields
 * @param {string|number|undefined} uid
 * @returns {Promise<Array<object>>}
 */
User.getUsersWithFields = async function (uids, fields, uid) {
    if (!Array.isArray(uids) && typeof uids !== 'string' && typeof uids !== 'number') {
        throw new TypeError(`uids should be an array, string, or number`);
    }

    if (!Array.isArray(fields) || !fields.every(field => typeof field === 'string')) {
        throw new TypeError(`Expected fields should be an array of strings`);
    }

    if (uid !== undefined && typeof uid !== 'string' && typeof uid !== 'number') {
        throw new TypeError(`Expected uid should be a string, number, or undefined`);
    }

    let results = await plugins.hooks.fire('filter:users.addFields', { fields: fields });

    if (!results || !Array.isArray(results.fields)) {
        throw new TypeError(`Expected results.fields to be an array`);
    }

    results.fields = _.uniq(results.fields);
    const userData = await User.getUsersFields(uids, results.fields);

    if (!Array.isArray(userData)) {
        throw new TypeError(`Expected userData to be an array`);
    }

    results = await plugins.hooks.fire('filter:userlist.get', { users: userData, uid: uid });

    if (!results || !Array.isArray(results.users)) {
        throw new TypeError(`Expected results.users to be an array of objects`);
    }

    return results.users;
};


/**
 * Retrieves user data with a set of predefined fields.
 * @param {Array|string|number|undefined} uids
 * @param {string|number|undefined} uid
 * @returns {Promise<object|Array<object>>}
 */
User.getUsers = async function (uids, uid) {
    if (!Array.isArray(uids) && typeof uids !== 'string' && typeof uids !== 'number') {
        throw new TypeError(`uids should be an array, string, number, or undefined`);
    }

    if (uid !== undefined && typeof uid !== 'string' && typeof uid !== 'number') {
        throw new TypeError(`uid should be a string, number, or undefined`);
    }

    const userData = await User.getUsersWithFields(uids, [
        'uid', 'username', 'userslug', 'accounttype', 'picture', 'status',
        'postcount', 'reputation', 'email:confirmed', 'lastonline',
        'flags', 'banned', 'banned:expire', 'joindate',
    ], uid);

    const hiddenData = await User.hidePrivateData(userData, uid);

    if (!Array.isArray(hiddenData) && typeof hiddenData !== 'object') {
        throw new TypeError(`Expected hiddenData to be a single user object or an array of user objects`);
    }

    return hiddenData;
};

/**
 * Retrieves the status of a user.
 * @param {object} userData
 * @property {number} userData.uid
 * @property {number} userData.lastonline
 * @property {string|undefined} userData.status
 * @returns {string} - The status of the user, either 'online' or 'offline'.
 */
User.getStatus = function (userData) {
    if (typeof userData !== 'object' || userData === null) {
        throw new TypeError(`Expected userData to be an object`);
    }
    if (typeof userData.uid !== 'number') {
        throw new TypeError(`Expected userData.uid to be a number`);
    }
    if (typeof userData.lastonline !== 'undefined' && typeof userData.lastonline !== 'number') {
        throw new TypeError(`Expected userData.lastonline to be a number`);
    }

    if (userData.uid <= 0) {
        return 'offline';
    }

    const isOnline = (Date.now() - userData.lastonline) < (meta.config.onlineCutoff * 60000);
    const status = isOnline ? (userData.status || 'online') : 'offline';

    if (typeof status !== 'string') {
        throw new TypeError(`Expected the status to be a string`);
    }

    return status;
};

/**
 * Gets a user by their username
 * @param {string} username
 * @returns {Promise<number>}
 */
User.getUidByUsername = async function (username) {
    if (typeof username !== 'string') {
        throw new TypeError(`Expected username to be a string`);
    }
    if (!username) {
        return 0;
    }
    const uid = await db.sortedSetScore('username:uid', username);

    if (uid !== '[[error:invalid-username]]' && typeof uid !== 'number') {
        throw new TypeError(`[[error:invalid-username]]`);
    }
    return uid;
};

/**
 * Gets users by their usernames
 * @param {Array<string>} usernames
 * @returns {Promise<Array<number>>}
 */
User.getUidsByUsernames = async function (usernames) {
    if (!Array.isArray(usernames)) {
        throw new TypeError(`Expected usernames to be a list`);
    }
    const uids = await db.sortedSetScores('username:uid', usernames);

    if (!Array.isArray(uids)) {
        throw new TypeError(`Expected uids to be a list}`);
    }
    return uids;
};

/**
 * Gets user by their userslug
 * @param {string} userslug
 * @returns {Promise<number>}
 */
User.getUidByUserslug = async function (userslug) {
    if (!userslug) {
        return 0;
    }
    const result = await db.sortedSetScore('userslug:uid', userslug);

    if (typeof result === 'object' || typeof result === 'number') {
        if (typeof result === 'number') {
            return result;
        } else if (typeof result === 'object' && result !== null) {
            if (typeof result.uid === 'number') {
                return result.uid;
            }
        }
    }

    return 0;
};

/**
 * Gets usernames by uids
 * @param {Array<number>} uids
 * @returns {Promise<Array<string>>}
 */
User.getUsernamesByUids = async function (uids) {
    if (!Array.isArray(uids)) {
        throw new TypeError(`Expected uids to be a list`);
    }
    const users = await User.getUsersFields(uids, ['username']);

    if (!Array.isArray(users)) {
        throw new TypeError(`Expected users to be a list`);
    }
    return users.map(user => user.username);
};

/**
 * Gets a username by a user's userslug
 * @param {string} slug
 * @returns {Promise<string>}
 */
User.getUsernameByUserslug = async function (slug) {
    if (typeof slug !== 'string') {
        throw new TypeError(`Expected slug to be a string`);
    }

    const uid = await User.getUidByUserslug(slug);
    const username = await User.getUserField(uid, 'username');

    if (typeof username !== 'string') {
        throw new TypeError(`Expected username to be a string`);
    }

    return username;
};

/**
 * Gets uid by users email
 * @param {string} email
 * @returns {Promise<number>}
 */
User.getUidByEmail = async function (email) {
    if (typeof email !== 'string') {
        throw new TypeError(`Expected email to be a string`);
    }

    const result = await db.sortedSetScore('email:uid', email.toLowerCase());

    if (typeof result === 'number') {
        return result;
    } else if (typeof result === 'object' && result !== null) {
        if (typeof result.uid === 'number') {
            return result.uid;
        }
    }

    return 0;
};

/**
 * Gets uids by emails
 * @param {Array<string>} emails
 * @returns {Promise<Array<number>>}
 */
User.getUidsByEmails = async function (emails) {
    if (!Array.isArray(emails)) {
        throw new TypeError(`Expected emails to be a list`);
    }
    emails = emails.map(email => email && email.toLowerCase());

    const uids = await db.sortedSetScores('email:uid', emails);
    if (!Array.isArray(uids)) {
        throw new TypeError(`Expected uids to be a list`);
    }
    return uids;
};

/**
 * Gets a users username by their email
 * @param {string} email
 * @returns {Promise<string>}
 */
User.getUsernameByEmail = async function (email) {
    if (typeof email !== 'string') {
        throw new TypeError(`Expected email to be a string`);
    }

    const uid = await db.sortedSetScore('email:uid', String(email).toLowerCase());
    const username = await User.getUserField(uid, 'username');

    if (typeof username !== 'string') {
        throw new TypeError(`Expected username to be a string`);
    }
    return username;
};

/**
 * Checks account type by their uid
 * @param {number} uid
 * @returns {Promise<object>}
 */
User.getAccountTypeByUid = async function (uid) {
    if (typeof uid !== 'number') {
        throw new TypeError(`[[error:invalid-username]]`);
    }

    const accounttype = User.getUserField(uid, 'accounttype');

    if (typeof accounttype !== 'object') {
        throw new TypeError(`Expected accounttype to be a object`);
    }

    return accounttype;
};

/**
 * Checks if a user is a moderator for a given CID or CIDs.
 * @param {Object} uid
 * @param {string|number|Array<string|number>|Object} cid
 * @returns {Promise<boolean|Array<boolean>>}
 */
User.isModerator = async function (uid, cid) {
    if (!typeof uid === 'object') {
        throw new TypeError(`Expected uid an object`);
    }

    if (typeof cid !== 'string' && typeof cid !== 'number' && !Array.isArray(cid) && typeof cid !== 'object') {
        throw new TypeError(`Expected cid to be a string, number, array, or object`);
    }

    const result = await privileges.users.isModerator(uid, cid);

    if (typeof result !== 'boolean' && !Array.isArray(result)) {
        throw new TypeError(`Expected result to be a boolean or an array of booleans`);
    }

    return result;
};




/**
 * Checks if user is a moderator of any category
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isModeratorOfAnyCategory = async function (uid) {
    if (typeof uid !== 'number') {
        return false;
    }

    const cids = await User.getModeratedCids(uid);
    const check = Array.isArray(cids) ? !!cids.length : false;

    if (typeof check !== 'boolean') {
        throw new TypeError(`Expected check to be a boolean`);
    }

    return check;
};

/**
 * Checks if user is an admin
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isAdministrator = async function (uid) {
    if (typeof uid !== 'number') {
        return false;
    }

    const check = await privileges.users.isAdministrator(uid);

    if (typeof check !== 'boolean') {
        throw new TypeError(`Expected check to be a boolean`);
    }

    return check;
};

/**
 * Checks if user is a global moderator
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isGlobalModerator = async function (uid) {
    if (typeof uid !== 'number') {
        return false;
    }

    const check = await privileges.users.isGlobalModerator(uid);

    if (typeof check !== 'boolean') {
        throw new TypeError(`Expected check to be a boolean`);
    }

    return check;
};

/**
 * Checks if user is an instructor
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isInstructor = async function (uid) {
    if (typeof uid !== 'number') {
        return false;
    }

    const accounttype = await User.getAccountTypeByUid(uid);
    const check = accounttype === 'instructor';

    if (typeof check !== 'boolean') {
        throw new TypeError(`Expected check to be a boolean`);
    }

    return check;
};

/**
 * Checks if user gets priviledges
 * @param {number} uid
 * @returns {Promise<object>}
 */
User.getPrivileges = async function (uid) {
    if (typeof uid !== 'number') {
        throw new TypeError(`[[error:invalid-username]]`);
    }

    const check = await utils.promiseParallel({
        isAdmin: User.isAdministrator(uid),
        isGlobalModerator: User.isGlobalModerator(uid),
        isModeratorOfAnyCategory: User.isModeratorOfAnyCategory(uid),
    });

    if (typeof check !== 'object') {
        throw new TypeError(`Expected check to be a object`);
    }

    return check;
};

/**
 * Checks if user is priviledged
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isPrivileged = async function (uid) {
    if (typeof uid !== 'number') {
        return true;
    }
    if (!(parseInt(uid, 10) > 0)) {
        return false;
    }

    const results = await User.getPrivileges(uid);
    const check = results ? (results.isAdmin || results.isGlobalModerator || results.isModeratorOfAnyCategory) : false;

    if (typeof check !== 'boolean') {
        throw new TypeError(`Expected result to be a boolean`);
    }

    return check;
};

/**
 * Checks if user is an admin or global moderator
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isAdminOrGlobalMod = async function (uid) {
    if (typeof uid !== 'number') {
        return true;
    }

    const [isAdmin, isGlobalMod] = await Promise.all([
        User.isAdministrator(uid),
        User.isGlobalModerator(uid),
    ]);
    const check = isAdmin || isGlobalMod;

    if (typeof check !== 'boolean') {
        throw new TypeError(`Expected check to be a boolean`);
    }

    return check;
};

/**
 * Checks if user is an admin or self
 * @param {number} callerUid
 * @param {number} uid
 * @returns {Promise<void>}
 */
User.isAdminOrSelf = async function (callerUid, uid) {
    if (typeof callerUid !== 'number') {
        throw new TypeError(`Expected callerUid to be a number`);
    }
    if (typeof uid !== 'number') {
        throw new TypeError(`[[error:invalid-username]]`);
    }

    const result = await isSelfOrMethod(callerUid, uid, User.isAdministrator);

    if (result !== undefined) {
        throw new Error(`Expected void but received a value`);
    }
};

/**
 * Checks if user is an admin or global moderator or self
 * @param {number} callerUid
 * @param {number} uid
 * @returns {Promise<void>}
 */
User.isAdminOrGlobalModOrSelf = async function (callerUid, uid) {
    if (typeof callerUid !== 'number') {
        throw new TypeError(`Expected callerUid to be a number`);
    }
    if (typeof uid !== 'number') {
        throw new TypeError(`[[error:invalid-username]]`);
    }

    const result = await isSelfOrMethod(callerUid, uid, User.isAdminOrGlobalMod);

    if (result !== undefined) {
        throw new Error(`Expected void`);
    }
};

/**
 * Checks if user is priviledged or self
 * @param {number} callerUid
 * @param {number} uid
 * @returns {Promise<void>}
 */
User.isPrivilegedOrSelf = async function (callerUid, uid) {
    if (typeof callerUid !== 'number') {
        throw new TypeError(`Expected callerUid to be a number`);
    }
    if (typeof uid !== 'number') {
        throw new TypeError(`[[error:invalid-username]]`);
    }

    const result = await isSelfOrMethod(callerUid, uid, User.isPrivileged);

    if (result !== undefined) {
        throw new Error(`Expected void but received a value`);
    }
};

/**
 * Check if the current user has certain privileges or permissions
 * @param {number} callerUid
 * @param {number} uid
 * @param {function(number): Promise<boolean>} method
 * @returns {Promise<void>}
 */
async function isSelfOrMethod(callerUid, uid, method) {
    if (typeof callerUid !== 'number') {
        throw new TypeError(`Expected callerUid to be a number`);
    }
    if (typeof uid !== 'number') {
        throw new Error(`[[error:invalid-username]]}`);
    }
    if (typeof method !== 'function') {
        throw new TypeError(`Expected method to be a function`);
    }

    if (parseInt(callerUid, 10) === parseInt(uid, 10)) {
        return;
    }

    const isPass = await method(callerUid);
    if (!isPass) {
        throw new Error('[[error:no-privileges]]');
    }
}

/**
 * Gets all admins and global moderators
 * @returns {Promise<Array<object>>}
 */
User.getAdminsandGlobalMods = async function () {
    const results = await groups.getMembersOfGroups(['administrators', 'Global Moderators']);
    const check = await User.getUsersData(_.union(...results));

    if (!Array.isArray(check)) {
        throw new Error(`Expected check to be a list`);
    }

    return check;
};

/**
 * Gets all admins, global moderators, and moderators
 * @returns {Promise<Array<object>>}
 */
User.getAdminsandGlobalModsandModerators = async function () {
    const results = await Promise.all([
        groups.getMembers('administrators', 0, -1),
        groups.getMembers('Global Moderators', 0, -1),
        User.getModeratorUids(),
    ]);
    const check = await User.getUsersData(_.union(...results));

    if (!Array.isArray(check)) {
        throw new Error(`Expected check to be a list`);
    }

    return check;
};

/**
 * Gets the first admin uid
 * @returns {Promise<number>}
 */
User.getFirstAdminUid = async function () {
    const result = (await db.getSortedSetRange('group:administrators:members', 0, 0))[0];

    if (result !== 'number') {
        throw new Error(`Expected result to be a number`);
    }

    return result;
};

/**
 * Gets the moderator uids
 * @returns {Promise<Array<number>>}
 */
User.getModeratorUids = async function () {
    const cids = await categories.getAllCidsFromSet('categories:cid');
    const uids = await categories.getModeratorUids(cids);
    const result = _.union(...uids);

    if (!Array.isArray(result)) {
        throw new Error(`Expected result to be a list`);
    }

    return result;
};


/**
 * Retrieves the CIDs a user is moderating.
 * @param {string|number} uid
 * @returns {Promise<Array<number|string>>}
 */
User.getModeratedCids = async function (uid) {
    if (typeof uid !== 'string' && typeof uid !== 'number') {
        throw new TypeError(`Expected uid to be a string or number`);
    }

    if (parseInt(uid, 10) <= 0) {
        return [];
    }

    const cids = await categories.getAllCidsFromSet('categories:cid');
    if (!Array.isArray(cids)) {
        throw new TypeError(`Expected cids to be an array`);
    }

    const isMods = await User.isModerator(uid, cids);
    if (!Array.isArray(isMods)) {
        throw new TypeError(`Expected isMods to be an array`);
    }

    const result = cids.filter((cid, index) => cid && isMods[index]);

    if (!Array.isArray(result)) {
        throw new TypeError(`Expected the result to be an array`);
    }

    return result;
};

/**
 * Registers interstitial methods for the user.
 * @param {function} callback
 * @returns {void}
 */
User.addInterstitials = function (callback) {
    if (typeof callback !== 'function') {
        throw new TypeError(`Expected callback to be a function`);
    }

    plugins.hooks.register('core', {
        hook: 'filter:register.interstitial',
        method: [
            User.interstitials.email, // Email address (for password reset + digest)
            User.interstitials.gdpr, // GDPR information collection/processing consent + email consent
            User.interstitials.tou, // Forum Terms of Use
        ],
    });

    callback();
};

require('../promisify')(User);
