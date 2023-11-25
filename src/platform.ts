import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { MagIQTouchPlatformAccessory } from './platformAccessory';
import { MagIQTouchService } from './magIQTouchService';

export class MagIQTouchHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly magIQTouchService: MagIQTouchService;
  private readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform');
    this.magIQTouchService = new MagIQTouchService(log, config, api);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices().finally();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    try {
      const devices = await this.magIQTouchService.getDevices();
      // loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {
        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        const uuid = this.api.hap.uuid.generate(device.MacAddressId);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info(
            'Restoring existing accessory from cache:',
            existingAccessory.displayName,
            uuid,
          );
          existingAccessory.context.state = await this.magIQTouchService.getState(
            device.MacAddressId,
          );
          existingAccessory.context.device = device;

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          new MagIQTouchPlatformAccessory(this, existingAccessory);

          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory:', device.MacAddressId);

          // create a new accessory
          const accessory = new this.api.platformAccessory(device.MacAddressId, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device;
          accessory.context.state = await this.magIQTouchService.getState(device.MacAddressId);

          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new MagIQTouchPlatformAccessory(this, accessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      this.log.error('Error loading devices', err.message || JSON.stringify(err));
    }
  }
}
