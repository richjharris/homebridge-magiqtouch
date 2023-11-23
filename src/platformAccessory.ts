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

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state: RemoteState;
  private pendingStateUpdates: Partial<RemoteState> = {};
  private macAddress: string;
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

    this.service.getCharacteristic(
      this.platform.Characteristic.TargetHeaterCoolerState,
    ).props.validValues = [
      this.platform.Characteristic.TargetHeaterCoolerState.HEAT,
      this.platform.Characteristic.TargetHeaterCoolerState.COOL,
    ];
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

    this.service.getCharacteristic(
      this.platform.Characteristic.CoolingThresholdTemperature,
    ).props.minValue = 19;
    this.service.getCharacteristic(
      this.platform.Characteristic.CoolingThresholdTemperature,
    ).props.maxValue = 28;
    this.service.getCharacteristic(
      this.platform.Characteristic.CoolingThresholdTemperature,
    ).props.minStep = 1;
    this.service
      .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(this.handleCoolingThresholdTemperatureGet.bind(this))
      .onSet(this.handleCoolingThresholdTemperatureSet.bind(this));
    this.service.getCharacteristic(
      this.platform.Characteristic.HeatingThresholdTemperature,
    ).props.minValue = 18;
    this.service.getCharacteristic(
      this.platform.Characteristic.HeatingThresholdTemperature,
    ).props.maxValue = 28;
    this.service.getCharacteristic(
      this.platform.Characteristic.HeatingThresholdTemperature,
    ).props.minStep = 1;
    this.service
      .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(this.handleHeatingThresholdTemperatureGet.bind(this))
      .onSet(this.handleHeatingThresholdTemperatureSet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed).props.minValue = 0;
    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed).props.maxValue = 100;
    this.localProps.set(this.platform.Characteristic.RotationSpeed, { minStep: 10 });
    this.service
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.handleRotationSpeedGet.bind(this))
      .onSet(this.handleRotationSpeedSet.bind(this));

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
  handleActiveSet(value: CharacteristicValue) {
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
      this.updateState(updates);
    }
    this.platform.log.debug('Triggered SET Active:', value);
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleHeaterCoolerStateGet() {
    this.platform.log.debug('Triggered GET CurrentHeaterCoolerState');

    if (this.state.SystemOn === 1 && this.state.HRunning) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
    }
    if (this.state.SystemOn === 1 && this.state.EvapCRunning) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
    }
    return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  handleHeaterCoolerStateSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET CurrentHeaterCoolerState:', value);

    let updates: Partial<RemoteState> = {};
    switch (value) {
      case this.platform.Characteristic.CurrentHeaterCoolerState.HEATING:
        updates = { SystemOn: 1, HFanOnly: 0, HRunning: 1, EvapCRunning: 0 };
        break;
      case this.platform.Characteristic.CurrentHeaterCoolerState.COOLING:
        updates = { SystemOn: 1, CFanOnlyOrCool: 0, HRunning: 0, EvapCRunning: 1 };
        break;
      case this.platform.Characteristic.Active.INACTIVE:
        updates = { SystemOn: 0 };
        break;
      default:
        this.platform.log.error('Unknown active state', value);
        return;
    }
    this.updateState(updates);
    this.platform.log.debug('Triggered SET Active:', value);
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleTargetHeaterCoolerStateGet() {
    this.platform.log.debug('Triggered GET TargetHeaterCoolerState');

    if (this.state.HRunning) {
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
  handleCoolingThresholdTemperatureSet(value: CharacteristicValue) {
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

    this.updateState({ FanOrTempControl: 1, CTemp: value });
    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed).updateValue(0);
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
  handleHeatingThresholdTemperatureSet(value: CharacteristicValue) {
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
    this.updateState({ FanOrTempControl: 1, HTemp: value });
    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed).updateValue(0);
    this.platform.log.debug('Triggered SET Heating Threshold Temperature:', value);
  }

  /**
   * Handle requests to get the current value of the "Rotation Speed" characteristic
   */
  handleRotationSpeedGet() {
    this.platform.log.debug('Triggered GET RotationSpeed');

    let value = this.state.CFanSpeed * 10;
    if (this.state.HRunning) {
      value = this.state.HFanSpeed * 10;
    }
    value = this.normaliseValue(
      value,
      this.platform.Characteristic.RotationSpeed,
      'RotationSpeed Get',
    );

    this.platform.log.info('Triggered GET Rotation Speed:', value, this.state.CFanSpeed);
    return value;
  }

  /**
   * Handle requests to set the "Rotation Speed" characteristic
   */
  handleRotationSpeedSet(value: CharacteristicValue) {
    this.platform.log.info('Triggered SET RotationSpeed:', value);

    if (!isNumber(value)) {
      this.platform.log.error('Unknown rotation speed type', value);
      return;
    }
    value = this.normaliseValue(
      value,
      this.platform.Characteristic.RotationSpeed,
      'RotationSpeed Set',
    );

    const fanSpeed = Math.round(value / 10);

    this.updateState({
      FanOrTempControl: fanSpeed === 0 ? 1 : 0,
      CFanSpeed: fanSpeed,
      HFanSpeed: fanSpeed,
    });
    this.platform.log.info('Triggered SET Rotation Speed:', fanSpeed);
  }

  /**
   * Ensure that value is within allowed minimum, maximum and step
   */
  private normaliseValue(
    value: number,
    characteristic: CharacteristicParam,
    description: string,
  ): number {
    const { minValue, maxValue, minStep } = {
      ...this.service.getCharacteristic(characteristic).props,
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
    this.platform.log.debug(description, value, this.state);
    return value;
  }

  private updateState(updates: Partial<RemoteState>) {
    Object.assign(this.pendingStateUpdates, updates);
    this.platform.magIQTouchService.updateState(this.macAddress, {
      ...this.state,
      ...this.pendingStateUpdates,
    });
  }
}
