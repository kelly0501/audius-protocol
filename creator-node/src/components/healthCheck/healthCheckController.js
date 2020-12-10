const express = require('express')
const { handleResponse, successResponse, errorResponseBadRequest, handleResponseWithHeartbeat, sendResponse } = require('../../apiHelpers')
const { healthCheck, healthCheckDuration } = require('./healthCheckComponentService')
const { syncHealthCheck } = require('./syncHealthCheckComponentService')
const { serviceRegistry } = require('../../serviceRegistry')
const { sequelize } = require('../../models')

const { recoverWallet } = require('../../apiSigning')
const { handleTrackContentUpload, removeTrackFolder } = require('../../fileManager')

const config = require('../../config')

const router = express.Router()

// 5 minutes in ms is the maximum age of a timestamp sent to /health_check/duration
const MAX_HEALTH_CHECK_TIMESTAMP_AGE_MS = 300000

// Helper Functions
/**
 * Verifies that the request is made by the delegate Owner
 */
const healthCheckVerifySignature = (req, res, next) => {
  let { timestamp, randomBytes, signature } = req.query
  if (!timestamp || !randomBytes || !signature) return sendResponse(req, res, errorResponseBadRequest(('Missing required query parameters')))

  const recoveryObject = { randomBytesToSign: randomBytes, timestamp }
  const recoveredPublicWallet = recoverWallet(recoveryObject, signature).toLowerCase()
  const recoveredTimestampDate = new Date(timestamp)
  const currentTimestampDate = new Date()
  const requestAge = currentTimestampDate - recoveredTimestampDate
  if (requestAge >= MAX_HEALTH_CHECK_TIMESTAMP_AGE_MS) {
    req.logger.debug('here')
    return sendResponse(req, res, errorResponseBadRequest(`Submitted timestamp=${recoveredTimestampDate}, current timestamp=${currentTimestampDate}. Maximum age =${MAX_HEALTH_CHECK_TIMESTAMP_AGE_MS}`))
  }
  const delegateOwnerWallet = config.get('delegateOwnerWallet').toLowerCase()
  if (recoveredPublicWallet !== delegateOwnerWallet) {
    req.logger.debug('here')
    return sendResponse(req, res, errorResponseBadRequest("Requester's public key does does not match Creator Node's delegate owner wallet."))
  }

  next()
}

// Controllers

/**
 * Controller for `health_check` route, calls
 * `healthCheckComponentService`.
 */
const healthCheckController = async (req) => {
  const logger = req.logger
  const response = await healthCheck(serviceRegistry, logger, sequelize)
  return successResponse(response)
}

/**
 * Controller for `health_check/sync` route, calls
 * syncHealthCheckController
 */
const syncHealthCheckController = async () => {
  const response = await syncHealthCheck(serviceRegistry)
  return successResponse(response)
}

/**
 * Controller for health_check/duration route
 * Calls healthCheckComponentService
 */
const healthCheckDurationController = async (req) => {
  let response = await healthCheckDuration()
  return successResponse(response)
}

/**
 * Controller for `health_check/verbose` route
 * Calls `healthCheckComponentService`.
 *
 * @todo Add disk usage, current load, and/or node details to response.
 * Will be used for cnode selection.
 */
const healthCheckVerboseController = async (req) => {
  const logger = req.logger
  const healthCheckResponse = await healthCheck(serviceRegistry, logger, sequelize)

  // TODO: add disk usage, current load, and/or node details to response
  return successResponse({
    ...healthCheckResponse,
    country: config.get('serviceCountry'),
    latitude: config.get('serviceLatitude'),
    longitude: config.get('serviceLongitude')
  })
}

/**
 * Controller for `health_check/fileupload` route
 * Calls `healthCheckFileUploadService`.
 */
const healthCheckFileUploadController = async (req) => {
  const err = req.fileFilterError || req.fileSizeError
  if (err) {
    throw new Error(err)
  } else {
    removeTrackFolder(req, req.fileDir)
    return successResponse({ success: true })
  }
}

// Routes

router.get('/health_check', handleResponse(healthCheckController))
router.get('/health_check/sync', handleResponse(syncHealthCheckController))
router.get('/health_check/duration', healthCheckVerifySignature, handleResponse(healthCheckDurationController))
router.get('/health_check/duration/heartbeat', healthCheckVerifySignature, handleResponseWithHeartbeat(healthCheckDurationController))
router.get('/health_check/verbose', handleResponse(healthCheckVerboseController))
router.post('/health_check/fileupload', healthCheckVerifySignature, handleTrackContentUpload, handleResponseWithHeartbeat(healthCheckFileUploadController))

module.exports = router
