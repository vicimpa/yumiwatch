#[cfg(any(target_os = "linux", test))]
fn logical_scale(dpi: f64) -> f64 {
    if dpi.is_finite() && dpi > 0.0 {
        (dpi / 96.0).clamp(0.5, 3.0)
    } else {
        1.0
    }
}

#[tauri::command]
pub fn set_interface_scale(
    window: tauri::WebviewWindow,
    scale: Option<f64>,
) -> Result<f64, String> {
    if window.label() != "main" {
        return Err("Неизвестное окно.".into());
    }
    if scale.is_some_and(|value| !value.is_finite() || !(0.75..=2.0).contains(&value)) {
        return Err("Некорректный масштаб интерфейса.".into());
    }
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;
        let native = window.gtk_window().map_err(|error| error.to_string())?;
        // GDK already scales window pixels for HiDPI monitors. Only compensate
        // logical/text DPI here, otherwise a 2x display would be scaled twice.
        let system = native
            .screen()
            .map(|screen| logical_scale(screen.resolution()))
            .unwrap_or(1.0);
        let factor = scale.unwrap_or(system);
        window.set_zoom(factor).map_err(|error| error.to_string())?;
        Ok(factor)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = scale;
        Ok(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accounts_for_logical_dpi_without_multiplying_monitor_scale() {
        assert_eq!(logical_scale(96.0), 1.0);
        assert_eq!(logical_scale(120.0), 1.25);
        assert_eq!(logical_scale(144.0), 1.5);
        assert_eq!(logical_scale(192.0), 2.0);
    }
    #[test]
    fn ignores_unset_or_invalid_dpi_and_bounds_extreme_values() {
        for dpi in [-1.0, 0.0, f64::NAN, f64::INFINITY] {
            assert_eq!(logical_scale(dpi), 1.0);
        }
        assert_eq!(logical_scale(1.0), 0.5);
        assert_eq!(logical_scale(960.0), 3.0);
    }
}
