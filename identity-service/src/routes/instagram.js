const request = require('request')
const config = require('../config.js')
const models = require('../models')
const txRelay = require('../relay/txRelay')

const { handleResponse, successResponse, errorResponseBadRequest } = require('../apiHelpers')

/**
 * This file contains the instagram endpoints for oauth
 * For official documentation on the instagram oauth flow check out their site
 * https://www.instagram.com/developer/authentication/
 */
module.exports = function (app) {
  app.post('/instagram', handleResponse(async (req, res, next) => {
    const { code } = req.body

    let reqObj = {
      method: 'post',
      url: 'https://api.instagram.com/oauth/access_token',
      form: {
        'client_id': config.get('instagramAPIKey'),
        'client_secret': config.get('instagramAPISecret'),
        'grant_type': 'authorization_code',
        'redirect_uri': config.get('instagramRedirectUrl'),
        code
      }
    }

    try {
      const res = await doRequest(reqObj)
      const authAccessToken = JSON.parse(res)
      let {
        access_token: accessToken
      } = authAccessToken

      const instagramAPIUser = await doRequest({
        method: 'get',
        url: 'https://graph.instagram.com/me',
        qs: {
          'fields': 'id,username,media_count,account_type',
          'access_token': accessToken
        }
      })
      const igUser = JSON.parse(instagramAPIUser)
      if (igUser.error) {
        return errorResponseBadRequest(new Error(igUser.error.message))
      }

      // Store the access token, user id, and current profile for user in db
      try {
        await models.InstagramUser.upsert({
          uuid: igUser.username,
          profile: igUser,
          accessToken
        })

        return successResponse(igUser)
      } catch (err) {
        return errorResponseBadRequest(err)
      }
    } catch (err) {
      return errorResponseBadRequest(err)
    }
  }))

  app.post('/instagram/profile', handleResponse(async (req, res, next) => {
    const { profile } = req.body
    try {
      const checkFields = [
        'id',
        'username',
        'is_verified'
      ]
      const hasMinimumFields = checkFields.every(field => (field in profile))
      if (!hasMinimumFields) throw new Error('Invalid profile')

      try {
        // Verify the user user id exists in the DB before updating it
        const igUser = await models.InstagramUser.findOne({ where: {
          uuid: profile.username
        } })
        if (!igUser) throw new Error('User must first be verified')
        igUser.profile = profile
        igUser.verified = profile.is_verified
        await igUser.save()

        return successResponse(profile)
      } catch (err) {
        return errorResponseBadRequest(err)
      }
    } catch (err) {
      return errorResponseBadRequest(err)
    }
  }))

  /**
   * After the user finishes onboarding in the client app and has a blockchain userId, we need to associate
   * the blockchainUserId with the instagram profile
   */
  app.post('/instagram/associate', handleResponse(async (req, res, next) => {
    let { uuid, userId, handle } = req.body
    const audiusLibsInstance = req.app.get('audiusLibs')
    try {
      let instagramObj = await models.InstagramUser.findOne({ where: { uuid } })

      // only set blockchainUserId if not already set
      if (instagramObj && !instagramObj.blockchainUserId) {
        instagramObj.blockchainUserId = userId

        // if the user is verified, write to chain, otherwise skip to next step
        if (instagramObj.verified) {
          const [encodedABI, contractAddress] = await audiusLibsInstance.User.updateIsVerified(
            userId, true, config.get('userVerifierPrivateKey')
          )
          const contractRegKey = await audiusLibsInstance.contracts.getRegistryContractForAddress(contractAddress)
          const senderAddress = config.get('userVerifierPublicKey')
          try {
            var txProps = {
              contractRegistryKey: contractRegKey,
              contractAddress: contractAddress,
              encodedABI: encodedABI,
              senderAddress: senderAddress,
              gasLimit: null
            }
            await txRelay.sendTransaction(req, false, txProps, 'instagramVerified')
          } catch (e) {
            return errorResponseBadRequest(e)
          }
        }

        const socialHandle = await models.SocialHandles.findOne({ where: { handle } })
        if (socialHandle) {
          socialHandle.instagramHandle = instagramObj.profile.username
          await socialHandle.save()
        } else if (instagramObj.profile && instagramObj.profile.username) {
          await models.SocialHandles.create({
            handle,
            instagramHandle: instagramObj.profile.username
          })
        }

        // the final step is to save userId to db and respond to request
        try {
          await instagramObj.save()
          return successResponse()
        } catch (e) {
          return errorResponseBadRequest(e)
        }
      } else {
        req.logger.error('Instagram profile does not exist or userId has already been set', instagramObj)
        return errorResponseBadRequest('Instagram profile does not exist or userId has already been set')
      }
    } catch (err) {
      return errorResponseBadRequest(err)
    }
  }))
}

/**
 * Since request is a callback based API, we need to wrap it in a promise to make it async/await compliant
 * @param {Object} reqObj construct request object compatible with `request` module
 */
function doRequest (reqObj) {
  return new Promise(function (resolve, reject) {
    request(reqObj, function (err, r, body) {
      if (err) reject(err)
      else resolve(body)
    })
  })
}
