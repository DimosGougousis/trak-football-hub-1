package com.academy.tiers.identity;

import java.time.LocalDate;
import java.util.UUID;

public record Account(UUID id, UUID academyId, String role, String email, String displayName, LocalDate dob) {}
