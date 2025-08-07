/*
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const APIError = require("../../api/APIError");
const { NodeUIDSelector, NodeInternalIDSelector, NodePathSelector } = require("../../filesystem/node/selectors");
const { is_valid_uuid4, is_valid_uuid } = require("../../helpers");
const validator = require("validator");
const { Context } = require("../../util/context");
const { is_valid_path } = require("../../filesystem/validation");
const FSNodeContext = require("../../filesystem/FSNodeContext");
const { Entity } = require("../entitystorage/Entity");

/**
 * Error class for object mapping type validation failures.
 * Thrown when a value doesn't match the expected type during adaptation or validation.
 */
class OMTypeError extends Error {
    /**
     * Creates a new OMTypeError with a formatted message.
     * @param {Object} params - Error parameters
     * @param {string} params.expected - The expected type name
     * @param {string} params.got - The actual type that was received
     */
    constructor ({ expected, got }) {
        const message = `expected ${expected}, got ${got}`;
        super(message);
        this.name = 'OMTypeError';
    }
}

module.exports = {
    /**
     * Base type that all other types can inherit from.
     * Provides fundamental type checking functionality.
     */
    base: {
        /**
         * Checks if a value is considered "set" (truthy).
         * @param {*} value - The value to check
         * @returns {boolean} True if the value is truthy, false otherwise
         */
        is_set (value) {
            return !! value;
        },
    },
    /**
     * JSON type for handling JSON data structures.
     * Inherits all functionality from the base type.
     */
    json: {
        from: 'base',
    },
    /**
     * String type with validation and adaptation capabilities.
     * Handles string conversion, length validation, and regex matching.
     */
    string: {
        from: 'base',
        /**
         * Adapts a value to a string, handling undefined and null values.
         * @param {*} value - The value to adapt to a string
         * @returns {Promise<string>} The adapted string value
         * @throws {OMTypeError} When the value cannot be converted to a string
         */
        async adapt (value) {
            if ( value === undefined ) return '';

            // SQL stores strings as null. If one-way adapt from db is supported
            // then this should become an sql-to-entity adapt only.
            if ( value === null ) return '';

            if ( typeof value !== 'string' ) {
                throw new OMTypeError({ expected: 'string', got: typeof value });
            }
            return value;
        },
        /**
         * Validates a string value against length and regex constraints.
         * @param {*} value - The value to validate
         * @param {Object} params - Validation parameters
         * @param {string} params.name - The field name for error reporting
         * @param {Object} params.descriptor - Field descriptor with validation rules
         * @returns {boolean|Error} True if valid, Error object if invalid
         * @throws {APIError} When length constraints are violated
         */
        validate (value, { name, descriptor }) {
            if ( typeof value !== 'string' ) {
                return new OMTypeError({ expected: 'string', got: typeof value });
            }
            if ( descriptor.hasOwnProperty('maxlen') && value.length > descriptor.maxlen ) {
                throw APIError.create('field_too_long', null, { key: name, max_length: descriptor.maxlen });
            }
            if ( descriptor.hasOwnProperty('minlen') && value.length > descriptor.minlen ) {
                throw APIError.create('field_too_short', null, { key: name, min_length: descriptor.maxlen });
            }
            if ( descriptor.hasOwnProperty('regex') && ! value.match(descriptor.regex) ) {
                return new Error(`string does not match regex ${descriptor.regex}`);
            }
            return true;
        }
    },
    /**
     * Array type with length and modulo validation.
     * Validates array structure and applies length constraints.
     */
    array: {
        from: 'base',
        /**
         * Validates an array value against length and modulo constraints.
         * @param {*} value - The value to validate as an array
         * @param {Object} params - Validation parameters
         * @param {string} params.name - The field name for error reporting
         * @param {Object} params.descriptor - Field descriptor with validation rules
         * @returns {boolean|OMTypeError} True if valid, OMTypeError if invalid
         * @throws {APIError} When array constraints are violated
         */
        validate (value, { name, descriptor }) {
            if ( ! Array.isArray(value) ) {
                return new OMTypeError({ expected: 'array', got: typeof value });
            }
            if ( descriptor.hasOwnProperty('maxlen') && value.length > descriptor.maxlen ) {
                throw APIError.create('field_too_long', null, { key: name, max_length: descriptor.maxlen });
            }
            if ( descriptor.hasOwnProperty('minlen') && value.length > descriptor.minlen ) {
                throw APIError.create('field_too_short', null, { key: name, min_length: descriptor.maxlen });
            }
            if ( descriptor.hasOwnProperty('mod') && value.length % descriptor.mod !== 0 ) {
                throw APIError.create('field_invalid', null, { key: name, mod: descriptor.mod });
            }
            return true;
        }
    },
    /**
     * Boolean flag type that handles various truthy/falsy representations.
     * Converts numeric and string representations to boolean values.
     */
    flag: {
        /**
         * Adapts various value types to boolean flags.
         * Handles undefined, numeric (0/1), and string ('0'/'1') representations.
         * @param {*} value - The value to adapt to a boolean
         * @returns {boolean} The adapted boolean value
         * @throws {OMTypeError} When the value cannot be converted to a boolean
         */
        adapt: value => {
            if ( value === undefined ) return false;
            if ( value === 0 ) value = false;
            if ( value === 1 ) value = true;
            if ( value === '0' ) value = false;
            if ( value === '1' ) value = true;
            if ( typeof value !== 'boolean' ) {
                throw new OMTypeError({ expected: 'boolean', got: typeof value });
            }
            return value;
        }
    },
    /**
     * UUID type that validates UUID version 4 format.
     * Extends string type with UUID-specific validation.
     */
    uuid: {
        from: 'string',
        /**
         * Validates that a string is a valid UUID version 4.
         * @param {string} value - The UUID string to validate
         * @returns {boolean} True if the value is a valid UUID v4
         */
        validate (value) {
            return is_valid_uuid4(value);
        },
    },
    /**
     * Puter-specific UUID type with prefix validation and generation.
     * Handles UUIDs with custom prefixes for different entity types.
     */
    ['puter-uuid']: {
        from: 'string',
        /**
         * Validates that a UUID has the correct prefix and valid UUID format.
         * @param {string} value - The prefixed UUID to validate
         * @param {Object} params - Validation parameters
         * @param {Object} params.descriptor - Field descriptor containing the required prefix
         * @returns {boolean|Error} True if valid, Error if prefix is missing or UUID is invalid
         */
        validate (value, { descriptor }) {
            const prefix = descriptor.prefix + '-';
            if ( ! value.startsWith(prefix) ) {
                return new Error(`UUID does not start with prefix ${prefix}`);
            }
            return is_valid_uuid(value.slice(prefix.length));
        },
        /**
         * Generates a new prefixed UUID using the descriptor's prefix.
         * @param {Object} params - Factory parameters
         * @param {Object} params.descriptor - Field descriptor containing the prefix
         * @returns {string} A new prefixed UUID
         */
        factory ({ descriptor }) {
            const prefix = descriptor.prefix + '-';
            const uuid = require('uuid').v4();
            return prefix + uuid;
        },
    },
    /**
     * Base64-encoded image type with security validation.
     * Validates data URI format and prevents XSS attacks.
     */
    ['image-base64']: {
        from: 'string',
        /**
         * Validates that a string is a base64-encoded image and safe from XSS.
         * @param {string} value - The base64 image string to validate
         * @returns {Error|undefined} Error if validation fails, undefined if valid
         */
        validate (value) {
            if ( ! value.startsWith('data:image/') ) {
                return new Error('image must be base64 encoded');
            }
            // XSS characters
            const chars = ['<', '>', '&', '"', "'", '`'];
            if ( chars.some(char => value.includes(char)) ) {
                return new Error('icon is not an image');
            }
        }
    },
    /**
     * URL type that validates URL format including localhost support.
     * Uses the validator library for URL validation.
     */
    url: {
        from: 'string',
        /**
         * Validates that a string is a properly formatted URL.
         * Accepts standard URLs and localhost URLs.
         * @param {string} value - The URL string to validate
         * @returns {boolean} True if the URL is valid
         */
        validate (value) {
            let valid = validator.isURL(value);
            if ( ! valid ) {
                valid = validator.isURL(value, { host_whitelist: ['localhost'] });
            }
            return valid;
        }
    },
    /**
     * Reference type for handling entity relationships and SQL references.
     * Manages conversion between entities and their database representations.
     */
    reference: {
        from: 'base',
        /**
         * Converts an entity reference to its SQL representation.
         * @param {*} value - The entity or reference value
         * @param {Object} params - Reference parameters
         * @param {Object} params.descriptor - Field descriptor with service information
         * @returns {Promise<*>} The SQL reference value (typically an ID)
         */
        async sql_reference (value, { descriptor }) {
            if ( ! descriptor.service ) return value;
            if ( ! value ) return null;
            if ( value instanceof Entity ) {
                return value.private_meta.mysql_id;
            }
            return value.id;
        },
        /**
         * Converts a SQL reference back to an entity object.
         * @param {*} value - The SQL reference value (typically an ID)
         * @param {Object} params - Reference parameters
         * @param {Object} params.descriptor - Field descriptor with service information
         * @returns {Promise<Entity|*>} The dereferenced entity or original value
         */
        async sql_dereference (value, { descriptor }) {
            if ( ! descriptor.service ) return value;
            if ( ! value ) return null;
            const svc = Context.get().get('services').get(descriptor.service);
            const entity = await svc.read(value);
            return entity;
        },
        /**
         * Adapts a reference value to an entity, loading it if necessary.
         * @param {*} value - The reference value to adapt
         * @param {Object} params - Adaptation parameters
         * @param {Object} params.descriptor - Field descriptor with service and debug information
         * @returns {Promise<Entity|*>} The adapted entity or original value
         */
        async adapt (value, { descriptor }) {
            if ( descriptor.debug ) {
                debugger; // eslint-disable-line no-debugger
            }
            if ( ! descriptor.service ) return value;
            if ( ! value ) return null;
            if ( value instanceof Entity ) return value;
            const svc = Context.get().get('services').get(descriptor.service);
            console.log('VALUE BEING READ', value);
            const entity = await svc.read(value);
            return entity;
        }
    },
    /**
     * Datetime type for handling date and time values.
     * Inherits base functionality without additional processing.
     */
    datetime: {
        from: 'base',
    },
    /**
     * Puter filesystem node type for handling file system references.
     * Manages conversion between node contexts and database representations.
     */
    ['puter-node']: {
        // from: 'base',
        /**
         * Converts a filesystem node to its SQL reference (MySQL ID).
         * @param {FSNodeContext|null} value - The filesystem node context
         * @returns {Promise<number|null>} The MySQL ID or null
         * @throws {Error} When value is not an FSNodeContext
         */
        async sql_reference (value) {
            if ( value === null ) return null;
            if ( ! (value instanceof FSNodeContext) ) {
                throw new Error('Cannot reference non-FSNodeContext');
            }
            await value.fetchEntry();
            return value.mysql_id ?? null;
        },
        /**
         * Checks if a filesystem node value is considered set.
         * @param {*} value - The value to check
         * @returns {Promise<boolean>} True if the value is set or explicitly null
         */
        async is_set (value) {
            return ( !! value ) || value === null;
        },
        /**
         * Converts a MySQL ID back to a filesystem node context.
         * @param {number|null} value - The MySQL ID to dereference
         * @returns {Promise<FSNodeContext|null>} The filesystem node context or null
         * @throws {Error} When value is not a number
         */
        async sql_dereference (value) {
            if ( value === null ) return null;
            if ( typeof value !== 'number' ) {
                throw new Error(
                    `Cannot dereference non-number: ${value}`
                );
            }
            const svc_fs = Context.get().get('services').get('filesystem');
            return svc_fs.node(
                new NodeInternalIDSelector('mysql', value)
            );
        },
        /**
         * Adapts various input formats to a filesystem node context.
         * Handles UUIDs, paths (including ~ for home directory), and existing contexts.
         * @param {string|FSNodeContext|null} value - The value to adapt
         * @param {Object} params - Adaptation parameters
         * @param {string} params.name - The field name for error reporting
         * @returns {Promise<FSNodeContext|null>} The adapted filesystem node context
         * @throws {Error} When ~ is used without a user context
         * @throws {APIError} When the path format is invalid
         */
        async adapt (value, { name }) {
            if ( value === null ) return null;

            if ( value instanceof FSNodeContext ) {
                return value;
            }
            const ctx = Context.get();

            if ( typeof value !== 'string' ) return;

            let selector;
            if ( ! ['/','.','~'].includes(value[0]) ) {
                if ( is_valid_uuid4(value) ) {
                    selector = new NodeUIDSelector(value);
                }
            } else {
                if ( value.startsWith('~') ) {
                    const user = ctx.get('user');
                    if ( ! user ) {
                        throw new Error('Cannot use ~ without a user');
                    }
                    const homedir = `/${user.username}`;
                    value = homedir + value.slice(1);
                }

                if ( ! is_valid_path(value) ) {
                    throw APIError.create('field_invalid', null, {
                        key: name,
                        expected: 'unix-style path or UUID',
                    });
                }

                selector = new NodePathSelector(value);
            }

            const svc_fs = ctx.get('services').get('filesystem');
            const node = await svc_fs.node(selector);
            return node;
        },
        /**
         * Validates filesystem node access permissions for the current actor.
         * @param {FSNodeContext|null} value - The filesystem node to validate
         * @param {Object} params - Validation parameters
         * @param {string} params.name - The field name for error reporting
         * @param {Object} params.descriptor - Field descriptor with permission requirements
         * @returns {Promise<APIError|undefined>} APIError if validation fails, undefined if valid
         */
        async validate (value, { name, descriptor }) {
            if ( value === null ) return;
            const actor = Context.get('actor');
            const permission = descriptor.fs_permission ?? 'see';

            console.log('actor??', actor, value, permission);

            const svc_acl = Context.get('services').get('acl');
            if ( await value.get('path') === '/' ) {
                return APIError.create('forbidden');
            }
            if ( ! await svc_acl.check(actor, value, permission) ) {
                return await svc_acl.get_safe_acl_error(actor, value, permission);
            }
        }
    },
};