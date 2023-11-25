<p align="center">

<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

<span align="center">

# MagIQTouch Homebridge Plugin

</span>

This is a plugin to support the [MagIQTouch](https://www.seeleyinternational.com/magiqtouch/) Next Generation Controller with WiFi.

### Features

Supported features:
- Evaporative cooling
- Heating (Caveat: it's only been tested on a system without heating)
- Current temperature
- Setting target temperature
- Setting fan speed
- Fan only mode

Unsupported features:
- Zones

Note: The controller works for heating and cooling by setting either fan speed or
target temperature. If the fan speed is set to 0 (automatic) it will automatically
set the fan speed to hit the target temperature. If the fan speed is set to
something greater than 0 then it will run at that speed regardless of the target
temperature. Setting the target temperature will set the fan speed back to
automatic. Setting a fan speed will ignore the target temperature and run the fan
at that speed. The fan speed in HomeKit is a percentage between 1 and 100.

### Configuration

The default configuration sets the HeaterCooler as the only service.

If **Fan Speed Control Enabled** is checked then tha fan speed can be changed, as of
iOS 17 the fan speed control for the Home App is within the settings of the HeaterCooler
service. See the note above about the connection between temperature and fan speed.

When **Fan Only Mode Enabled** is checked a Switch service is added that allows you to
change between fan only mode and heating/cooling mode. The switch will be on when fan
only mode is enabled.

When **Fan Speed Switch Enabled** is checked a Switch service is added that changes
(and shows) whether the system is currently in heat/cool mode to a temperature or
heat/cool mode with a fixed fan speed (see the note in Features). The switch will be
on when the system is in heat/cool mode with a set fan speed.

Note that since iOS16 there is an issue with multiple Homebridge switches in an accessory
that they will show as the name of the accessory, not the name of the switch, see
https://github.com/homebridge/homebridge/issues/3210#issuecomment-1217735865. The work
around is to go into the setting of each switch and set the correct name, see
https://github.com/merdok/homebridge-xiaomi-fan/issues/123#issuecomment-1239074853.

If either **Fan Only Mode Enabled** or **Fan Speed Switch Enabled** are checked and
**Fan Speed Control Enabled** is also checked then there is an independent fan control
service to set the fan speed rather than having to go into the HeaterCooler service
setting which gets buried in the home app when there a multiple services for the
accessory.

### Credit

The logic for talking to the API is based on the [Home Assistant MagIQTouch Component](https://github.com/andrewleech/ha_magiqtouch)
