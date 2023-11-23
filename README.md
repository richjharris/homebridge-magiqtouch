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

Unsupported features:
- Fan only mode
- Zones

Note: The controller works for heating and cooling by setting either fan speed or
target temperature. If the fan speed is set to 0 (automatic) it will automatically
set the fan speed to hit the target temperature. If the fan speed is set to
something greater than 0 then it will run at that speed regardless of the target
temperature. Setting the target temperature will set the fan speed back to
automatic. Setting a fan speed will ignore the target temperature and run the fan
at that speed.

### Credit

The logic for talking to the API is based on the [Home Assistant MagIQTouch Component](https://github.com/andrewleech/ha_magiqtouch)
