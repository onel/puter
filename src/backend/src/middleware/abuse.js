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
const APIError = require("../api/APIError");
const { Context } = require("../util/context");

/**
 * Creates an Express middleware function for abuse prevention.
 * Validates requests based on bot detection and origin requirements.
 * 
 * @param {Object} options - Configuration options for abuse prevention
 * @param {boolean} [options.no_bots] - If true, blocks requests from bots
 * @param {Function} [options.shadow_ban_responder] - Custom response handler for shadow-banned bots
 * @param {boolean} [options.puter_origin] - If true, only allows requests from Puter origin
 * @returns {Function} Express middleware function that takes (req, res, next) parameters
 * @throws {APIError} Throws 'forbidden' error when validation fails
 */
const abuse = options => (req, res, next) => {
    const requester = Context.get('requester');

    if ( options.no_bots ) {
        if ( requester.is_bot ) {
            if ( options.shadow_ban_responder ) {
                return options.shadow_ban_responder(req, res);
            }
            throw APIError.create('forbidden');
        }
    }

    if ( options.puter_origin ) {
        if ( ! requester.is_puter_origin() ) {
            throw APIError.create('forbidden');
        }
    }

    next();
};

module.exports = abuse;