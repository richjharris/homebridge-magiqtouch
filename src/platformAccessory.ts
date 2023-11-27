import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  WithUUID,
  Characteristic,
  CharacteristicProps,
} from 'homebridge';

import { MagIQTouchHomebridgePlatform } from './platform';
import { RemoteState } from './remote-access';
import { MagIQTouchSupportedModes } from './magIQTouchService';

function isNumber(val: unknown): val is number {
  return Number.isFinite(val);
}

type CharacteristicParam = WithUUID<{
  new (): Characteristic;
}>;

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MagIQTouchPlatformAccessory {
  private service: Service;
  private fanOnlySwitchService?: Service = undefined;
  private tempFanSwitchService?: Service = undefined;
  private fanService: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state: RemoteState;
  private pendingStateUpdates: Partial<RemoteState> = {};
  private supportedModes: MagIQTouchSupportedModes;
  private macAddress: string;
  private fanControlEnabled: boolean;
  private fanOnlyModeEnabled: boolean;
  private tempFanSwitchEnabled: boolean;
  private readonly localProps: Map<
    CharacteristicParam,
    Pick<CharacteristicProps, 'minValue' | 'maxValue' | 'minStep'>
  > = new Map();

  constructor(
    private readonly platform: MagIQTouchHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.macAddress = accessory.context.device.MacAddressId;
    this.state = accessory.context.state;
    this.supportedModes = accessory.context.supportedModes;
    this.fanControlEnabled = this.platform.config.fanControlEnabled ?? true;
    this.fanOnlyModeEnabled = this.platform.config.fanOnlyModeEnabled ?? false;
    this.tempFanSwitchEnabled = this.platform.config.tempFanSwitchEnabled ?? false;
    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Seeley International')
      .setCharacteristic(
        this.platform.Characteristic.Model,
        'MagIQtouch Next Generation Controller',
      )
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.macAddress);

    // get the HeaterCooler service if it exists, otherwise create a new HeaterCooler service
    this.service =
      this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, 'MagIQTouch');

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/HeaterCooler

    // create handlers for required characteristics
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleHeaterCoolerStateGet.bind(this))
      .onSet(this.handleHeaterCoolerStateGet.bind(this));

    const validHeaterCoolerStateValues = [
      ...(this.supportedModes.heating
        ? [this.platform.Characteristic.TargetHeaterCoolerState.HEAT]
        : []),
      ...(this.supportedModes.cooling
        ? [this.platform.Characteristic.TargetHeaterCoolerState.COOL]
        : []),
    ];
    this.service.getCharacteristic(
      this.platform.Characteristic.TargetHeaterCoolerState,
    ).props.validValues = validHeaterCoolerStateValues;
    this.platform.log.debug('Valid HeaterCoolerState Values', validHeaterCoolerStateValues);
    this.service.getCharacteristic(
      this.platform.Characteristic.TargetHeaterCoolerState,
    ).props.minValue = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    this.service.getCharacteristic(
      this.platform.Characteristic.TargetHeaterCoolerState,
    ).props.maxValue = this.platform.Characteristic.TargetHeaterCoolerState.COOL;

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.handleTargetHeaterCoolerStateGet.bind(this))
      .onSet(this.handleTargetHeaterCoolerStateSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    if (this.supportedModes.cooling) {
      this.platform.log.debug('Cooling supported', this.supportedModes.cooling);
      this.service.getCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature,
      ).props.minValue = this.supportedModes.cooling.minimumTemperature;
      this.service.getCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature,
      ).props.maxValue = this.supportedModes.cooling.maximumTemperature;
      this.service.getCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature,
      ).props.minStep = 1;
      this.service
        .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
        .onGet(this.handleCoolingThresholdTemperatureGet.bind(this))
        .onSet(this.handleCoolingThresholdTemperatureSet.bind(this));
    } else {
      this.platform.log.debug('Cooling unsupported');
      const oldCoolingThresholdTemperatureCharacteristic = this.service.getCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature,
      );
      if (oldCoolingThresholdTemperatureCharacteristic) {
        this.service.removeCharacteristic(oldCoolingThresholdTemperatureCharacteristic);
      }
    }
    if (this.supportedModes.heating) {
      this.platform.log.debug('Heating supported', this.supportedModes.heating);
      this.service.getCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature,
      ).props.minValue = this.supportedModes.heating.minimumTemperature;
      this.service.getCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature,
      ).props.maxValue = this.supportedModes.heating.maximumTemperature;
      this.service.getCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature,
      ).props.minStep = 1;
      this.service
        .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
        .onGet(this.handleHeatingThresholdTemperatureGet.bind(this))
        .onSet(this.handleHeatingThresholdTemperatureSet.bind(this));
    } else {
      this.platform.log.debug('Heating unsupported');
      const oldHeatingThresholdTemperatureCharacteristic = this.service.getCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature,
      );
      if (oldHeatingThresholdTemperatureCharacteristic) {
        this.service.removeCharacteristic(oldHeatingThresholdTemperatureCharacteristic);
      }
    }
    this.service.setPrimaryService();
    if ((this.fanOnlyModeEnabled || this.tempFanSwitchEnabled) && this.fanControlEnabled) {
      this.platform.log.debug('Creating fan service');
      // get the FanV2 service if it exists, otherwise create a new FanV2 service
      this.fanService =
        this.accessory.getService(this.platform.Service.Fanv2) ||
        this.accessory.addService(this.platform.Service.Fanv2);

      this.fanService
        .getCharacteristic(this.platform.Characteristic.Active)
        .onGet(this.handleActiveGet.bind(this))
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .onSet(() => {});
      this.fanService.getCharacteristic(this.platform.Characteristic.Active).props.validValues = [
        this.platform.Characteristic.Active.ACTIVE,
        this.platform.Characteristic.Active.INACTIVE,
      ];

      // set the service name, this is what is displayed as the default name on the Home app
      this.fanService.setCharacteristic(this.platform.Characteristic.Name, 'Fan Speed');
    } else {
      this.platform.log.debug('Removing fan service');
      this.fanService = this.service;
      const oldFanService = this.accessory.getService(this.platform.Service.Fanv2);
      if (oldFanService) {
        this.accessory.removeService(oldFanService);
      }
    }
    if (this.fanControlEnabled) {
      this.platform.log.debug('Fan control enabled');
      this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed).props.minValue =
        0;
      this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed).props.maxValue =
        100;
      this.localProps.set(this.platform.Characteristic.RotationSpeed, { minStep: 10 });
      this.fanService
        .getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .onGet(this.handleRotationSpeedGet.bind(this))
        .onSet(this.handleRotationSpeedSet.bind(this));
    }
    if (!this.fanControlEnabled || this.fanService !== this.service) {
      const oldRotationSpeedCharacteristic = this.service.getCharacteristic(
        this.platform.Characteristic.RotationSpeed,
      );
      if (oldRotationSpeedCharacteristic) {
        this.service.removeCharacteristic(oldRotationSpeedCharacteristic);
      }
    }

    if (this.fanOnlyModeEnabled) {
      // get the Switch service if it exists, otherwise create a new Switch service
      this.fanOnlySwitchService =
        this.accessory.getService('Fan Only') ||
        this.accessory.addService(this.platform.Service.Switch, 'Fan Only', 'FAN_ONLY');

      // set the service name, this is what is displayed as the default name on the Home app
      // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
      this.fanOnlySwitchService.setCharacteristic(this.platform.Characteristic.Name, 'Fan Only');

      // each service must implement at-minimum the "required characteristics" for the given service type
      // see https://developers.homebridge.io/#/service/Switch

      // create handlers for required characteristics
      this.fanOnlySwitchService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(this.handleFanOnlyGet.bind(this))
        .onSet(this.handleFanOnlySet.bind(this));
    } else {
      const oldSwitchService = this.accessory.getService('Fan Only');
      if (oldSwitchService) {
        this.accessory.removeService(oldSwitchService);
      }
    }

    if (this.tempFanSwitchEnabled) {
      // get the Switch service if it exists, otherwise create a new Switch service
      this.tempFanSwitchService =
        this.accessory.getService('Fan Speed Set') ||
        this.accessory.addService(this.platform.Service.Switch, 'Fan Speed Set', 'TEMP_FAN');

      // set the service name, this is what is displayed as the default name on the Home app
      // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
      this.tempFanSwitchService.setCharacteristic(
        this.platform.Characteristic.Name,
        'Fan Speed Set',
      );

      // each service must implement at-minimum the "required characteristics" for the given service type
      // see https://developers.homebridge.io/#/service/Switch

      // create handlers for required characteristics
      this.tempFanSwitchService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(this.handleTempFanGet.bind(this))
        .onSet(this.handleTempFanSet.bind(this));
    } else {
      const oldSwitchService = this.accessory.getService('Fan Speed Set');
      if (oldSwitchService) {
        this.accessory.removeService(oldSwitchService);
      }
    }

    this.platform.api.updatePlatformAccessories([accessory]);

    setInterval(async () => {
      try {
        const newState = await this.platform.magIQTouchService.getState(this.macAddress);
        this.state = newState;
        this.pendingStateUpdates = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        this.platform.log.error('Error fetching current state', err.message || JSON.stringify(err));
      }
    }, 5000);
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  handleActiveGet() {
    this.platform.log.debug('Triggered GET Active');

    return this.state.SystemOn === 1
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  async handleActiveSet(value: CharacteristicValue) {
    let updates: Partial<RemoteState> | null = {};
    switch (value) {
      case this.platform.Characteristic.Active.ACTIVE:
        if (this.state.SystemOn !== 1) {
          updates = { SystemOn: 1 };
        }
        break;
      case this.platform.Characteristic.Active.INACTIVE:
        if (this.state.SystemOn !== 0) {
          updates = { SystemOn: 0 };
        }
        break;
      default:
        this.platform.log.error('Unknown active state', value);
    }
    if (updates) {
      await this.updateState(updates);
    }
    if (this.service !== this.fanService) {
      this.fanService.getCharacteristic(this.platform.Characteristic.Active).updateValue(value);
    }
    this.platform.log.debug('Triggered SET Active:', value);
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleHeaterCoolerStateGet() {
    this.platform.log.debug('Triggered GET CurrentHeaterCoolerState');

    if (this.state.SystemOn === 1 && this.isHeatRunning()) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
    }
    if (this.state.SystemOn === 1 && this.isCoolingRunning()) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
    }
    return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  async handleHeaterCoolerStateSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET CurrentHeaterCoolerState:', value);

    let updates: Partial<RemoteState> = {};
    switch (value) {
      case this.platform.Characteristic.CurrentHeaterCoolerState.HEATING:
        updates = {
          SystemOn: 1,
          HRunning: 0,
          EvapCRunning: 0,
          FAOCRunning: 0,
          IAOCRunning: 0,
          ...(this.supportedModes.heating
            ? { [this.supportedModes.heating.temperatureKey]: 1 }
            : {}),
        };
        break;
      case this.platform.Characteristic.CurrentHeaterCoolerState.COOLING:
        updates = {
          SystemOn: 1,
          HRunning: 0,
          EvapCRunning: 0,
          FAOCRunning: 0,
          IAOCRunning: 0,
          ...(this.supportedModes.cooling
            ? { [this.supportedModes.cooling.temperatureKey]: 1 }
            : {}),
        };
        break;
      case this.platform.Characteristic.Active.INACTIVE:
        updates = { SystemOn: 0 };
        break;
      default:
        this.platform.log.error('Unknown active state', value);
        return;
    }
    await this.updateState(updates);
    this.platform.log.debug('Triggered SET Active:', value);
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleTargetHeaterCoolerStateGet() {
    this.platform.log.debug('Triggered GET TargetHeaterCoolerState');

    if (this.isHeatRunning()) {
      return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    }
    return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeaterCoolerStateSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET TargetHeaterCoolerState:', value);
    // TODO - Handle this
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet() {
    this.platform.log.debug('Triggered GET CurrentTemperature');
    return this.state.InternalTemp;
  }

  /**
   * Handle requests to get the current value of the "Cooling Threshold Temperature" characteristic
   */
  handleCoolingThresholdTemperatureGet() {
    this.platform.log.debug('Triggered GET CoolingTemperatureThreshold');

    return this.normaliseValue(
      this.state.CTemp,
      this.platform.Characteristic.CoolingThresholdTemperature,
      'CoolingTemperatureThreshold Get',
    );
  }

  /**
   * Handle requests to set the "Cooling Threshold Temperature" characteristic
   */
  async handleCoolingThresholdTemperatureSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET CoolingTemperatureThreshold:', value);

    if (!isNumber(value)) {
      this.platform.log.error('Unknown temperature type', value);
      return;
    }
    value = this.normaliseValue(
      value,
      this.platform.Characteristic.CoolingThresholdTemperature,
      'CoolingThresholdTemperature Set',
    );

    await this.updateState({ FanOrTempControl: 1, CTemp: value, CFanOnlyOrCool: 0 });
    this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed).updateValue(0);
    this.fanOnlySwitchService
      ?.getCharacteristic(this.platform.Characteristic.On)
      .updateValue(false);
    this.platform.log.debug('Triggered SET Cooling Temperature:', value);
  }

  /**
   * Handle requests to get the current value of the "Heating Threshold Temperature" characteristic
   */
  handleHeatingThresholdTemperatureGet() {
    this.platform.log.debug('Triggered GET HeatingTemperatureThreshold');

    return this.normaliseValue(
      this.state.HTemp,
      this.platform.Characteristic.HeatingThresholdTemperature,
      'HeatingTemperatureThreshold Get',
    );
  }

  /**
   * Handle requests to set the "Heating Threshold Temperature" characteristic
   */
  async handleHeatingThresholdTemperatureSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET HeatingThresholdTemperature:', value);
    if (!isNumber(value)) {
      this.platform.log.error('Unknown temperature type', value);
      return;
    }
    value = this.normaliseValue(
      value,
      this.platform.Characteristic.HeatingThresholdTemperature,
      'HeatingThresholdTemperature Set',
    );
    await this.updateState({ FanOrTempControl: 1, HTemp: value, HFanOnly: 0 });
    this.fanOnlySwitchService
      ?.getCharacteristic(this.platform.Characteristic.On)
      .updateValue(false);
    this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed).updateValue(0);
    this.fanOnlySwitchService
      ?.getCharacteristic(this.platform.Characteristic.On)
      .updateValue(false);

    this.platform.log.debug('Triggered SET Heating Threshold Temperature:', value);
  }

  /**
   * Handle requests to get the current value of the "Rotation Speed" characteristic
   */
  handleRotationSpeedGet() {
    this.platform.log.debug('Triggered GET RotationSpeed');

    let value = this.state.CFanSpeed * 10;
    if (this.isHeatRunning()) {
      value = this.state.HFanSpeed * 10;
    }
    value = this.normaliseValue(
      value,
      this.platform.Characteristic.RotationSpeed,
      'RotationSpeed Get',
      this.fanService,
    );

    this.platform.log.info('Triggered GET Rotation Speed:', value, this.state.CFanSpeed);
    return value;
  }

  /**
   * Handle requests to set the "Rotation Speed" characteristic
   */
  async handleRotationSpeedSet(value: CharacteristicValue) {
    this.platform.log.info('Triggered SET RotationSpeed:', value);

    if (!isNumber(value)) {
      this.platform.log.error('Unknown rotation speed type', value);
      return;
    }
    value = this.normaliseValue(
      value,
      this.platform.Characteristic.RotationSpeed,
      'RotationSpeed Set',
      this.fanService,
    );

    if (
      this.fanOnlySwitchService?.getCharacteristic(this.platform.Characteristic.On).value &&
      value < 10
    ) {
      value = 10;
    }

    const fanSpeed = Math.round(value / 10);

    await this.updateState({
      FanOrTempControl: fanSpeed === 0 ? 1 : 0,
      CFanSpeed: fanSpeed,
      HFanSpeed: fanSpeed,
    });
    this.platform.log.info('Triggered SET Rotation Speed:', fanSpeed);
  }

  /**
   * Handle requests to get the current value of the Fan Only "On" characteristic
   */
  handleFanOnlyGet() {
    this.platform.log.debug('Triggered GET Fan Only On');
    return this.isFanOnly();
  }

  /**
   * Handle requests to set the Fan Only "On" characteristic
   */
  async handleFanOnlySet(value: CharacteristicValue) {
    const updates: Partial<RemoteState> = value
      ? {
          CFanOnlyOrCool: 1,
          HFanOnly: 1,
          CFanSpeed: this.state.CFanSpeed || 1,
          HFanSpeed: this.state.HFanSpeed || 1,
        }
      : { CFanOnlyOrCool: 0, HFanOnly: 0 };
    await this.updateState(updates);
    this.platform.log.debug('Triggered SET Fan Only On:', value);
  }

  /**
   * Handle requests to get the current value of the Temp/Fan Speed "On" characteristic
   */
  handleTempFanGet() {
    this.platform.log.debug('Triggered GET Fan Only On');

    return this.isFanOnly() || this.state.FanOrTempControl === 0;
  }

  /**
   * Handle requests to set the Temp/Fan Speed "On" characteristic
   */
  async handleTempFanSet(value: CharacteristicValue) {
    if (this.isFanOnly()) {
      return;
    }
    const updates: Partial<RemoteState> = value
      ? {
          FanOrTempControl: 0,
          CFanSpeed: this.state.CFanSpeed || 1,
          HFanSpeed: this.state.HFanSpeed || 1,
        }
      : { FanOrTempControl: 1 };
    await this.updateState(updates);
    this.platform.log.debug('Triggered SET Temp/Fan Speed On:', value);
  }

  /**
   * Ensure that value is within allowed minimum, maximum and step
   */
  private normaliseValue(
    value: number,
    characteristic: CharacteristicParam,
    description: string,
    service: Service = this.service,
  ): number {
    const { minValue, maxValue, minStep } = {
      ...service.getCharacteristic(characteristic).props,
      ...this.localProps.get(characteristic),
    };

    if (minValue !== undefined && value < minValue) {
      this.platform.log.error(`${description} below minimum`, value);
      value = minValue;
    }
    if (maxValue !== undefined && value > maxValue) {
      this.platform.log.error(`${description} above maximum`, value);
      value = maxValue;
    }
    if (minStep !== undefined && (value - (minValue ?? 0)) % minStep) {
      this.platform.log.error(`${description} doesn't match min step`, value);
      const diff = (value - (minValue ?? 0)) % minStep;
      value -= diff;
      if (minValue !== undefined && value === minValue && diff > 0.0001) {
        // If minValue is 0 and minStep is 10 and the value being set is
        // 1 set the value to 10 rather than 1 as something above minValue
        // has been requested so use the lowest valid value that's above
        // minValue.
        value += minStep;
      }
    }
    this.platform.log.debug(description, value, { minValue, maxValue, minStep }, this.state);
    return value;
  }

  private async updateState(updates: Partial<RemoteState>) {
    Object.assign(this.pendingStateUpdates, updates);
    await this.platform.magIQTouchService.updateState(this.macAddress, {
      ...this.state,
      ...this.pendingStateUpdates,
    });
  }

  private isFanOnly(): boolean {
    const state = { ...this.state, ...this.pendingStateUpdates };
    return (
      (this.isCoolingRunning(state) && state.CFanOnlyOrCool === 1) ||
      (this.isHeatRunning(state) && state.HFanOnly === 1)
    );
  }

  private isHeatRunning(state = this.state): boolean {
    return (
      (this.supportedModes.heating || false) &&
      state[this.supportedModes.heating.temperatureKey] === 1
    );
  }

  private isCoolingRunning(state = this.state): boolean {
    return (
      (this.supportedModes.cooling || false) &&
      state[this.supportedModes.cooling.temperatureKey] === 1
    );
  }
}
