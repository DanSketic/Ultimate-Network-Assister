// Keeps a console window from opening alongside the app in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ultimate_network_assister_lib::run()
}
