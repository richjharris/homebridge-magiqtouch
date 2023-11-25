import { API, Logger, PlatformConfig } from 'homebridge';
import * as AmazonCognitoIdentity from 'amazon-cognito-identity-js';
import axios from 'axios';
import { Device, RemoteState, newStateRequest } from './remote-access';

// Connection settings are pulled from https://github.com/andrewleech/ha_magiqtouch/blob/main/magiqtouch.py
const UserPoolId = 'ap-southeast-2_uw5VVNlib';
const ClientId = '6e1lu9fchv82uefiarsp0290v9';
const Api = 'https://57uh36mbv1.execute-api.ap-southeast-2.amazonaws.com/api';
const NewApi = 'https://tgjgb3bcf3.execute-api.ap-southeast-2.amazonaws.com/prod/v1';

export class MagIQTouchService {
  private authToken: {
    token: string;
    expiry: number;
  } | null = null;

  constructor(
    private readonly log: Logger,
    private readonly config: PlatformConfig,
    private readonly api: API,
  ) {
    this.log.debug('Service Instantiated!');
  }

  private async getAuthHeaders(): Promise<{ Authorization: string }> {
    if (this.authToken && this.authToken.expiry > Date.now() / 1000 + 60) {
      return { Authorization: `Bearer ${this.authToken.token}` };
    }
    this.log.info('Refreshing authentication token');
    const authenticationData = {
      Username: this.config.username,
      Password: this.config.password,
    };
    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
      authenticationData,
    );
    const poolData = { UserPoolId, ClientId };
    const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
    const userData = {
      Username: this.config.username,
      Pool: userPool,
    };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const _this = this;
    return new Promise<{ Authorization: string }>((resolve, reject) => {
      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess(result) {
          const token = result.getIdToken().getJwtToken();
          const expiry = result.getIdToken().getExpiration();
          _this.log.info('Authentication token successfully refreshed');
          _this.authToken = { token, expiry };
          resolve({ Authorization: `Bearer ${token}` });
        },

        onFailure(err) {
          _this.log.error('Error logging in', err.message || JSON.stringify(err));
          reject(err);
        },
      });
    });
  }

  public async getDevices(): Promise<Device[]> {
    const mobileInfo = await axios.get<Device[]>(`${Api}/loadmobiledevice`, {
      headers: await this.getAuthHeaders(),
    });
    return mobileInfo.data;
  }

  public async getState(macAddress: string): Promise<RemoteState> {
    const mobileInfo = await axios.get<RemoteState>(
      `${Api}/loadsystemrunning?macAddressId=${encodeURIComponent(macAddress)}`,
      {
        headers: await this.getAuthHeaders(),
      },
    );
    return mobileInfo.data;
  }

  public async updateState(macAddress: string, state: RemoteState): Promise<void> {
    try {
      const request = newStateRequest(state);
      this.log.debug('Update State', request);
      await axios.put(`${NewApi}/devices/${encodeURIComponent(macAddress)}`, request, {
        headers: await this.getAuthHeaders(),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      this.log.error('Error updating state', err.message || JSON.stringify(err));
    }
  }
}
