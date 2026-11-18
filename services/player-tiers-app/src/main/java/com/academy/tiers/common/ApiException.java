package com.academy.tiers.common;

import org.springframework.http.HttpStatus;

/** An error the API returns as {@code {"error": "<code>"}} with the given status. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }

    public String code() { return code; }

    public static ApiException forbidden() { return new ApiException(HttpStatus.FORBIDDEN, "forbidden"); }

    public static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "not_found"); }

    public static ApiException unprocessable(String code) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code); }
}
