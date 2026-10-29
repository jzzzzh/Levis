use super::*;

#[test]
fn stop_fences_late_enqueue_but_allows_a_new_send_in_the_same_task() {
    let mut registry = Registry::default();
    let mut permission = ImageTaskPermission {
        task_id: "task".into(),
        document_id: "document".into(),
        generation_id: "send-1".into(),
        base_revision: 0,
        allow_automatic: true,
    };
    assert!(generation_active(&registry, &permission).is_ok());
    stop_generation(&mut registry, &permission);
    assert!(generation_active(&registry, &permission).is_err());
    permission.generation_id = "send-2".into();
    assert!(generation_active(&registry, &permission).is_ok());
}
#[test]
fn image_prompt_lookup_matches_asset_names_across_folders() {
    assert_eq!(
        asset_name(&percent_decode(
            "/Users/me/Application%20Support/assets/image-1-2-0.jpg"
        )),
        Some("image-1-2-0.jpg")
    );
    assert_eq!(
        asset_name("assets/image-1-2-0.jpg"),
        Some("image-1-2-0.jpg")
    );
    assert_eq!(asset_name("assets/photo.png"), None);
    assert_eq!(generated_stem("image-1-2-0-1-1.jpg"), "image-1-2-0");
    assert_eq!(generated_stem("image-1-2-0.jpg"), "image-1-2-0");
    assert_eq!(percent_decode("a%2"), "a%2");
    assert_eq!(percent_decode("%e4%b8%ad%中"), "中%中");
}

#[test]
fn permission_is_request_scoped_and_limits_include_retries() {
    let mut counts = HashMap::new();
    let mut per_generation = HashMap::new();
    let mut permission = ImageTaskPermission {
        generation_id: "generation".into(),
        task_id: "task".into(),
        document_id: "document".into(),
        base_revision: 0,
        allow_automatic: false,
    };
    assert!(reserve(&mut counts, &mut per_generation, &permission).is_err());
    permission.allow_automatic = true;
    assert_eq!(
        reserve(&mut counts, &mut per_generation, &permission).unwrap(),
        1
    );
    assert_eq!(
        reserve(&mut counts, &mut per_generation, &permission).unwrap(),
        2
    );
    assert!(reserve(&mut counts, &mut per_generation, &permission).is_err());
    // The next send of the same task gets its own two; the task's jobs
    // keep counting on.
    permission.generation_id = "next-send".into();
    assert_eq!(
        reserve(&mut counts, &mut per_generation, &permission).unwrap(),
        3
    );
    permission.document_id = "other-document".into();
    assert_eq!(
        reserve(&mut counts, &mut per_generation, &permission).unwrap(),
        1
    );
}
