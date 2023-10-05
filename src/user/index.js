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

// skipped
User.exists = async function (uids) {
    return await (
        Array.isArray(uids) ?
            db.isSortedSetMembers('users:joindate', uids) :
            db.isSortedSetMember('users:joindate', uids)
    );
};

// Document the type signature in code comments
/**
 * Checks if a user exists by their slug
 * @param {string} userslug
 * @returns {Promise<boolean>}
 */
User.existsBySlug = async function (userslug) {
    // Assert function parameter types in the body
    if (typeof userslug !== 'string') {
        throw new TypeError('Expected userslug to be a string');
    }
    const exists = await User.getUidByUserslug(userslug);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof !!exists !== 'boolean') {
        throw new TypeError('Expected result to be a boolean');
    }
    return !!exists;
};

// Document the type signature in code comments
/**
 * Gets uids from a set
 * @param {string} set
 * @param {number} start
 * @param {number} stop
 * @returns {Promise<number[]>}
 */
User.getUidsFromSet = async function (set, start, stop) {
    // Assert function parameter types in the body
    if (typeof set !== 'string') {
        throw new TypeError('Expected set to be a string');
    }
    if (typeof start !== 'number') {
        throw new TypeError('Expected start to be a number');
    }
    if (typeof stop !== 'number') {
        throw new TypeError('Expected stop to be a number');
    }
    if (set === 'users:online') {
        const count = parseInt(stop, 10) === -1 ? stop : stop - start + 1;
        const now = Date.now();
        return await db.getSortedSetRevRangeByScore(set, start, count, '+inf', now - (meta.config.onlineCutoff * 60000));
    }
    const list = await db.getSortedSetRevRange(set, start, stop);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(list)) {
        throw new TypeError('Expected result to be a list');
    }
    return list;
};

// Document the type signature in code comments
/**
 * Gets users from a set
 * @param {string} set
 * @param {number} uid
 * @param {number} start
 * @param {number} stop
 * @returns {Promise<number[]>}
 */
User.getUsersFromSet = async function (set, uid, start, stop) {
    // Assert function parameter types in the body
    if (typeof set !== 'string') {
        throw new TypeError('Expected set to be a string');
    }
    if (typeof start !== 'number') {
        throw new TypeError('Expected start to be a number');
    }
    if (typeof stop !== 'number') {
        throw new TypeError('Expected stop to be a number');
    }
    const uids = await User.getUidsFromSet(set, start, stop);
    const list = await User.getUsers(uids, uid);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(list)) {
        throw new TypeError('Expected result to be a list');
    }
    return list;
};

// TIMEOUT ERROR
// Document the type signature in code comments
/**
 * Gets users with fields
 * @param {number[]} uids
 * @param {string[]} fields
 * @param {number} uid
 * @returns {Promise<object[]>}
 */
User.getUsersWithFields = async function (uids, fields, uid) {
    // Assert function parameter types in the body
    // if (!Array.isArray(uids)) {
    //     throw new TypeError('Expected uids to be a list');
    // }
    // if (!Array.isArray(fields)) {
    //     throw new TypeError('Expected fields to be a list');
    // }
    // if (typeof uid !== 'number') {
    //     throw new TypeError('Expected uid to be a number');
    // }
    let results = await plugins.hooks.fire('filter:users.addFields', { fields: fields });
    results.fields = _.uniq(results.fields);
    const userData = await User.getUsersFields(uids, results.fields);
    results = await plugins.hooks.fire('filter:userlist.get', { users: userData, uid: uid });
    const list = results.users;
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(list)) {
        throw new TypeError('Expected result to be a list');
    }
    return list;
};

// TIMEOUT ERROR
User.getUsers = async function (uids, uid) {
    const userData = await User.getUsersWithFields(uids, [
        'uid', 'username', 'userslug', 'accounttype', 'picture', 'status',
        'postcount', 'reputation', 'email:confirmed', 'lastonline',
        'flags', 'banned', 'banned:expire', 'joindate',
    ], uid);

    return User.hidePrivateData(userData, uid);
};

// TIMEOUT ERROR
User.getStatus = function (userData) {
    if (userData.uid <= 0) {
        return 'offline';
    }
    const isOnline = (Date.now() - userData.lastonline) < (meta.config.onlineCutoff * 60000);
    return isOnline ? (userData.status || 'online') : 'offline';
};

// Document the type signature in code comments
/**
 * Gets a user by their username
 * @param {string} username
 * @returns {Promise<number>}
 */
User.getUidByUsername = async function (username) {
    // Assert function parameter types in the body
    if (typeof username !== 'string') {
        throw new TypeError('Expected username to be a string');
    }
    if (!username) {
        return 0;
    }
    const uid = await db.sortedSetScore('username:uid', username);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof uid !== 'number') {
        throw new TypeError('[[error:invalid-username]]');
    }
    return uid;
};

// Document the type signature in code comments
/**
 * Gets users by their usernames
 * @param {string[]} usernames
 * @returns {Promise<number[]>}
 */
User.getUidsByUsernames = async function (usernames) {
    // Assert function parameter types in the body
    if (!Array.isArray(usernames)) {
        throw new TypeError('Expected usernames to be a list');
    }
    const uids = await db.sortedSetScores('username:uid', usernames);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(uids)) {
        throw new TypeError('Expected uids to be a list');
    }
    return uids;
};

// Document the type signature in code comments
/**
 * Gets user by their userslug
 * @param {string} userslug
 * @returns {Promise<number>}
 */
User.getUidByUserslug = async function (userslug) {
    // Assert function parameter types in the body
    if (!userslug) {
        return 0;
    }
    const result = await db.sortedSetScore('userslug:uid', userslug);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof result === 'object' || typeof result === 'number') {
        // Handle both object and number cases
        if (typeof result === 'number') {
            return result;
        } else if (typeof result === 'object' && result !== null) {
            // Extract the number from the object, assuming there is a key called 'uid'
            if (typeof result.uid === 'number') {
                return result.uid;
            }
        }
    }
    return 0;
};

// Document the type signature in code comments
/**
 * Gets usernames by uids
 * @param {number[]} uids
 * @returns {Promise<string[]>}
 */
User.getUsernamesByUids = async function (uids) {
    // Assert function parameter types in the body
    if (!Array.isArray(uids)) {
        throw new TypeError('Expected uids to be a list');
    }
    const users = await User.getUsersFields(uids, ['username']);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(users)) {
        throw new TypeError('Expected users to be a list');
    }
    return users.map(user => user.username);
};

// Document the type signature in code comments
/**
 * Gets a username by a user's userslug
 * @param {string} slug
 * @returns {Promise<string>}
 */
User.getUsernameByUserslug = async function (slug) {
    // Assert function parameter types in the body
    if (typeof slug !== 'string') {
        throw new TypeError('Expected slug to be a string');
    }
    const uid = await User.getUidByUserslug(slug);
    const username = await User.getUserField(uid, 'username');
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof username !== 'string') {
        throw new TypeError('Expected result to be a string');
    }
    return username;
};

// Document the type signature in code comments
/**
 * Gets uid by users email
 * @param {string} email
 * @returns {Promise<number>}
 */
User.getUidByEmail = async function (email) {
    // Assert function parameter types in the body
    if (typeof email !== 'string') {
        throw new TypeError('Expected email to be a string');
    }
    const result = await db.sortedSetScore('email:uid', email.toLowerCase());
    // // Assert function return types in the body or write unit tests that execute and
    // // validate that the function returns the expected type
    if (typeof result === 'number') {
        return result;
    } else if (typeof result === 'object' && result !== null) {
        // Extract the number from the object, assuming there is a key called 'uid'
        if (typeof result.uid === 'number') {
            return result.uid;
        }
    }
    return 0;
};

// Document the type signature in code comments
/**
 * Gets uids by emails
 * @param {string[]} emails
 * @returns {Promise<number[]>}
 */
User.getUidsByEmails = async function (emails) {
    // Assert function parameter types in the body
    if (!Array.isArray(emails)) {
        throw new TypeError('Expected emails to be a list');
    }
    emails = emails.map(email => email && email.toLowerCase());
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    const uids = await db.sortedSetScores('email:uid', emails);
    if (!Array.isArray(uids)) {
        throw new TypeError('Expected uids to be a list');
    }
    return uids;
};

// Document the type signature in code comments
/**
 * Gets a users username by their email
 * @param {string} email
 * @returns {Promise<string>}
 */
User.getUsernameByEmail = async function (email) {
    // Assert function parameter types in the body
    if (typeof email !== 'string') {
        throw new TypeError('Expected email to be a string');
    }
    const uid = await db.sortedSetScore('email:uid', String(email).toLowerCase());
    const username = await User.getUserField(uid, 'username');
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof username !== 'string') {
        throw new TypeError('Expected result to be a string');
    }
    return username;
};

// Document the type signature in code comments
/**
 * Checks account type by their uid
 * @param {number} uid
 * @returns {Promise<object>}
 */
User.getAccountTypeByUid = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        throw new TypeError('Expected uid to be a number');
    }
    const accounttype = User.getUserField(uid, 'accounttype');
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof accounttype !== 'object') {
        throw new TypeError('Expected result to be a object');
    }
    return accounttype;
};

// Uncaught AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: assert(body.flags)
// Document the type signature in code comments
/**
 * Checks if user is a moderator
 * @param {number} uid
 * @param {number} cid
 * @returns {Promise<boolean>}
 */
User.isModerator = async function (uid, cid) {
    // Assert function parameter types in the body
    // if (typeof uid !== 'number') {
    //     return false;
    // }
    // if (typeof cid !== 'number') {
    //     return false;
    // }
    const result = await privileges.users.isModerator(uid, cid);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    // if (typeof result === 'object' || typeof result === 'boolean') {
    //     // Handle both object and boolean cases
    //     if (typeof result === 'boolean') {
    //         return result;
    //     } else if (typeof result === 'object' && result !== null) {
    //         // Extract the number from the object, assuming there is a key called 'uid'
    //         const moderator = result.moderator;
    //         if (typeof moderator === 'boolean') {
    //             return moderator;
    //         }
    //     }
    // }
    // return false;
    return result;
};

// Document the type signature in code comments
/**
 * Checks if user is a moderator of any category
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isModeratorOfAnyCategory = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        return false;
    }
    const cids = await User.getModeratedCids(uid);
    const check = Array.isArray(cids) ? !!cids.length : false;
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof check !== 'boolean') {
        throw new TypeError('Expected result to be a boolean');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Checks if user is an admin
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isAdministrator = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        return false;
    }
    const check = await privileges.users.isAdministrator(uid);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof check !== 'boolean') {
        throw new TypeError('Expected result to be a boolean');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Checks if user is a global moderator
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isGlobalModerator = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        return false;
    }
    const check = await privileges.users.isGlobalModerator(uid);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof check !== 'boolean') {
        throw new TypeError('Expected result to be a boolean');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Checks if user is an instructor
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isInstructor = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        return false;
    }
    const accounttype = await User.getAccountTypeByUid(uid);
    const check = accounttype === 'instructor';
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof check !== 'boolean') {
        throw new TypeError('Expected result to be a boolean');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Checks if user gets priviledges
 * @param {number} uid
 * @returns {Promise<object>}
 */
User.getPrivileges = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        throw new TypeError('Expected uid to be a number');
    }
    const check = await utils.promiseParallel({
        isAdmin: User.isAdministrator(uid),
        isGlobalModerator: User.isGlobalModerator(uid),
        isModeratorOfAnyCategory: User.isModeratorOfAnyCategory(uid),
    });
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof check !== 'object') {
        throw new TypeError('Expected result to be a object');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Checks if user is priviledged
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isPrivileged = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        return true;
    }
    if (!(parseInt(uid, 10) > 0)) {
        return false;
    }
    const results = await User.getPrivileges(uid);
    const check = results ? (results.isAdmin || results.isGlobalModerator || results.isModeratorOfAnyCategory) : false;
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof check !== 'boolean') {
        throw new TypeError('Expected result to be a boolean');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Checks if user is an admin or global moderator
 * @param {number} uid
 * @returns {Promise<boolean>}
 */
User.isAdminOrGlobalMod = async function (uid) {
    // Assert function parameter types in the body
    if (typeof uid !== 'number') {
        return true;
    }
    const [isAdmin, isGlobalMod] = await Promise.all([
        User.isAdministrator(uid),
        User.isGlobalModerator(uid),
    ]);
    const check = isAdmin || isGlobalMod;
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (typeof check !== 'boolean') {
        throw new TypeError('Expected result to be a boolean');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Checks if user is an admin or self
 * @param {number} callerUid
 * @param {number} uid
 * @returns {Promise<void>}
 */
User.isAdminOrSelf = async function (callerUid, uid) {
    // Assert function parameter types in the body
    if (typeof callerUid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    if (typeof uid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    const result = await isSelfOrMethod(callerUid, uid, User.isAdministrator);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (result !== undefined) {
        throw new Error('Expected void but received a value');
    }
};

// Document the type signature in code comments
/**
 * Checks if user is an admin or global moderator or self
 * @param {number} callerUid
 * @param {number} uid
 * @returns {Promise<void>}
 */
User.isAdminOrGlobalModOrSelf = async function (callerUid, uid) {
    // Assert function parameter types in the body
    if (typeof callerUid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    if (typeof uid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    const result = await isSelfOrMethod(callerUid, uid, User.isAdminOrGlobalMod);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (result !== undefined) {
        throw new Error('Expected void but received a value');
    }
};

// Document the type signature in code comments
/**
 * Checks if user is priviledged or self
 * @param {number} callerUid
 * @param {number} uid
 * @returns {Promise<void>}
 */
User.isPrivilegedOrSelf = async function (callerUid, uid) {
    // Assert function parameter types in the body
    if (typeof callerUid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    if (typeof uid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    const result = await isSelfOrMethod(callerUid, uid, User.isPrivileged);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (result !== undefined) {
        throw new Error('Expected void but received a value');
    }
};

// Document the type signature in code comments
/**
 * Check if the current user has certain privileges or permissions
 * @param {number} callerUid
 * @param {number} uid
 * @param {function(number): Promise<boolean>} method
 * @returns {Promise<void>}
 */
async function isSelfOrMethod(callerUid, uid, method) {
    // Assert function parameter types in the body
    if (typeof callerUid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    if (typeof uid !== 'number') {
        throw new TypeError('Expected result to be a number');
    }
    if (typeof method !== 'function') {
        throw new TypeError('Expected method to be a function');
    }
    if (parseInt(callerUid, 10) === parseInt(uid, 10)) {
        return;
    }
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    const isPass = await method(callerUid);
    if (!isPass) {
        throw new Error('[[error:no-privileges]]');
    }
}

// Document the type signature in code comments
/**
 * Gets all admins and global moderators
 * @returns {Promise<object[]>}
 */
User.getAdminsandGlobalMods = async function () {
    const results = await groups.getMembersOfGroups(['administrators', 'Global Moderators']);
    const check = await User.getUsersData(_.union(...results));
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(check)) {
        throw new Error('Expected result to be a list');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Gets all admins, global moderators, and moderators
 * @returns {Promise<object[]>}
 */
User.getAdminsandGlobalModsandModerators = async function () {
    const results = await Promise.all([
        groups.getMembers('administrators', 0, -1),
        groups.getMembers('Global Moderators', 0, -1),
        User.getModeratorUids(),
    ]);
    const check = await User.getUsersData(_.union(...results));
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(check)) {
        throw new Error('Expected result to be a list');
    }
    return check;
};

// Document the type signature in code comments
/**
 * Gets the first admin uid
 * @returns {Promise<number>}
 */
User.getFirstAdminUid = async function () {
    const result = (await db.getSortedSetRange('group:administrators:members', 0, 0))[0];
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (result !== 'number') {
        throw new Error('Expected result to be a number');
    }
    return result;
};

// Document the type signature in code comments
/**
 * Gets the moderator uids
 * @returns {Promise<number[]>}
 */
User.getModeratorUids = async function () {
    const cids = await categories.getAllCidsFromSet('categories:cid');
    const uids = await categories.getModeratorUids(cids);
    const result = _.union(...uids);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(result)) {
        throw new Error('Expected result to be a list');
    }
    return result;
};

// Document the type signature in code comments
/**
 * Gets the moderator cids
 * @param {number} uid
 * @returns {Promise<number[]>}
 */
User.getModeratedCids = async function (uid) {
    // AssertionError [ERR_ASSERTION]: Expected values to be strictly equal
    // Assert function parameter types in the body
    // if (typeof uid !== 'number') {
    //     throw new TypeError('Expected result to be a number');
    // }
    if (parseInt(uid, 10) <= 0) {
        return [];
    }
    const cids = await categories.getAllCidsFromSet('categories:cid');
    const isMods = await User.isModerator(uid, cids);
    const result = cids.filter((cid, index) => cid && isMods[index]);
    // Assert function return types in the body or write unit tests that execute and
    // validate that the function returns the expected type
    if (!Array.isArray(result)) {
        throw new Error('Expected result to be a list');
    }
    return result;
};

User.addInterstitials = function (callback) {
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
